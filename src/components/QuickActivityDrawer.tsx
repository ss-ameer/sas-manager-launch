import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  MessageSquare,
  Mail,
  Users,
  User,
  MapPin,
  Calendar,
  Send,
  Check,
  Sparkles,
  Clock,
  ShieldAlert,
  Building2,
  FileText,
  Loader2,
  Copy,
  ExternalLink,
  KeyRound,
  AlertCircle,
  Search,
  ChevronDown,
  Plus,
  Trash2,
  Briefcase,
  UserPlus,
  Zap,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useEntityEdit } from '../context/EntityEditContext';
import { safeAddDoc, safeSetDoc, safeUpdateDoc } from '../firebase';
import {
  Company,
  Contact,
  Enquiry,
  CallLogEntry,
  CallStatus,
  ActivityChannel,
  getContactPhones,
  getCompanyPhones,
  getContactEmails,
  getCompanyEmails,
  isSamePhoneNumber
} from '../types';
import { CallLogRepository } from '../services/repositories/CallLogRepository';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { findDuplicateCompany } from '../utils/fuzzyMatch';
import { PARENT_INDUSTRIES, getDistinctRawBusinessTypes } from '../utils/taxonomy';
import { CreatableCombobox } from './CreatableCombobox';
import { generateNextRefId } from '../utils/refId';
import { CustomLabelSelect, PHONE_LABEL_DEFAULT_OPTIONS, EMAIL_LABEL_DEFAULT_OPTIONS } from './CustomLabelSelect';
import GeminiKeyModal from './GeminiKeyModal';
import { SYSTEM_CALL_PURPOSES, getWhatsAppUrl, sanitizeWhatsAppNumber } from '../utils/defaults';
import { normalizeActivityChannel } from '../context/ActivityLauncherContext';
import {
  CHANNELS,
  PURPOSES,
  OUTCOMES,
  POSITIVE_OUTCOMES,
  NEUTRAL_OUTCOMES,
  NEGATIVE_OUTCOMES,
  getStatusesForChannel,
  isSuccessStatus,
  getPurposesForChannel,
  getOutcomesForStatus,
  CALL_OUTCOMES,
  MEETING_OUTCOMES,
  SITE_VISIT_OUTCOMES,
  MESSAGE_OUTCOMES
} from '../utils/activityLogic';

export {
  CHANNELS,
  PURPOSES,
  OUTCOMES,
  getStatusesForChannel,
  isSuccessStatus,
  getPurposesForChannel,
  getOutcomesForStatus,
  CALL_OUTCOMES,
  MEETING_OUTCOMES,
  SITE_VISIT_OUTCOMES,
  MESSAGE_OUTCOMES
};

export interface QuickActivityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drawerMode?: 'create' | 'edit' | 'execute';
  existingLog?: CallLogEntry | null;
  logToEdit?: CallLogEntry | null;
  companyId?: string;
  companyName?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  targetType?: 'contact' | 'company_mainline';
  enquiryId?: string;
  initialChannel?: ActivityChannel | string;
  initialStatus?: CallStatus;
  activeWorkspaceId: string;
  currentSalespersonId: string;
  currentUserInitials: string;
  currentUserUid?: string;
  currentUserName?: string;
  user?: any;
  onSaveSuccess: () => void;
  callStatuses?: { name: string }[];
  callOutcomes?: { name: string, sentiment?: string }[];
  callPurposes?: { name: string }[];
  industryTypes?: { name: string }[];
  companies?: Company[];
  contacts?: Contact[];
  enquiries?: Enquiry[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  onUpdateCompany?: (company: Company) => void;
  onUpdateContact?: (contact: Contact) => void;
  onSave?: (log: CallLogEntry) => void;
  onUpdate?: (log: CallLogEntry) => void;
  onOpen360?: (companyId: string) => void;
  onInspectCompany?: (companyId: string) => void;
  onOpenCompanyModal?: (companyId: string) => void;
}

export type { ActivityChannel };

export interface ExpressPhoneItem {
  id: string;
  label: string;
  number: string;
}

export interface ExpressEmailItem {
  id: string;
  label: string;
  email: string;
}

export const SYSTEM_CALL_PURPOSES_TAXONOMY = [...SYSTEM_CALL_PURPOSES];

export const channelStatuses: Record<string, string[]> = {
  'Phone Call': getStatusesForChannel('Phone Call'),
  Call: getStatusesForChannel('Phone Call'),
  'Message (WhatsApp/SMS)': getStatusesForChannel('Message (WhatsApp/SMS)'),
  WhatsApp: getStatusesForChannel('Message (WhatsApp/SMS)'),
  Message: getStatusesForChannel('Message (WhatsApp/SMS)'),
  Email: getStatusesForChannel('Email'),
  'Meeting (Virtual/In-Person)': getStatusesForChannel('Meeting (Virtual/In-Person)'),
  Meeting: getStatusesForChannel('Meeting (Virtual/In-Person)'),
  'Site Visit': getStatusesForChannel('Site Visit'),
  'Internal Task / Admin': getStatusesForChannel('Internal Task / Admin'),
  Task: getStatusesForChannel('Internal Task / Admin'),
  internal_task: getStatusesForChannel('Internal Task / Admin')
};

export const isPhoneChannel = (ch?: ActivityChannel | string): boolean => {
  const norm = String(ch || '').toLowerCase();
  return norm.includes('call') || norm.includes('phone');
};

export const isMessageChannel = (ch?: ActivityChannel | string): boolean => {
  const norm = String(ch || '').toLowerCase();
  return norm.includes('message') || norm.includes('whatsapp') || norm.includes('sms');
};

export const isPhoneOrMessageChannel = (ch?: ActivityChannel | string): boolean => {
  return isPhoneChannel(ch) || isMessageChannel(ch);
};

export const isInternalTaskChannel = (ch?: ActivityChannel | string): boolean => {
  const norm = String(ch || '').toLowerCase().trim();
  return norm.includes('internal') || norm.includes('task') || norm.includes('admin');
};

const getLocalDateTimeString = (d: Date = new Date()): string => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const formatToDatetimeLocal = (dateStr?: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    if (dateStr.length >= 10) {
      return `${dateStr.slice(0, 10)}T09:00`;
    }
    return '';
  }
  return getLocalDateTimeString(d);
};

export const QuickActivityDrawer: React.FC<QuickActivityDrawerProps> = ({
  isOpen,
  onClose,
  drawerMode,
  existingLog,
  logToEdit,
  companyId,
  companyName,
  contactId,
  contactName,
  contactPhone,
  contactEmail,
  targetType,
  enquiryId,
  initialChannel,
  initialStatus,
  activeWorkspaceId,
  callStatuses = [],
  callOutcomes = [],
  callPurposes = [],
  industryTypes = [],
  currentSalespersonId,
  currentUserInitials,
  currentUserUid,
  currentUserName,
  user,
  onSaveSuccess,
  companies = [],
  contacts = [],
  enquiries = [],
  setCompanies,
  setContacts,
  setCallLogs,
  onUpdateCompany,
  onUpdateContact,
  onSave,
  onUpdate,
  onOpen360,
  onInspectCompany,
  onOpenCompanyModal
}) => {
  const { openEditCompany, openEditContact } = useEntityEdit();
  const [channel, setChannel] = useState<ActivityChannel>(initialChannel || 'Call');
  const interactionChannel = channel;
  const isInternalTask = isInternalTaskChannel(interactionChannel);
  const [outcome, setOutcome] = useState<string>('');
  const [status, setStatus] = useState<CallStatus>(initialStatus || 'Completed');
  const availablePurposes = useMemo(() => {
    if (callPurposes && callPurposes.length > 0) {
      return Array.from(new Set([...SYSTEM_CALL_PURPOSES, ...callPurposes.map(p => p.name)]));
    }
    return [...SYSTEM_CALL_PURPOSES];
  }, [callPurposes]);

  const [purpose, setPurpose] = useState<string>('Discovery / Qualification');

  const isCompletedState = isSuccessStatus(status);

  const handleChannelSelect = (newChannel: ActivityChannel) => {
    setChannel(newChannel);
    const newChanStr = newChannel as string;
    const isCall = isPhoneChannel(newChanStr);
    const available = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(newChannel);
    let activeStatus = status;
    if (available.length > 0 && !available.includes(status)) {
      activeStatus = available[0] as CallStatus;
      setStatus(activeStatus);
    }

    if (!availablePurposes.includes(purpose)) {
      setPurpose(availablePurposes[0] || 'Discovery / Qualification');
    }

    const isAsync = isMessageChannel(newChanStr) || newChanStr.toLowerCase().includes('email');
    const isInternal = isInternalTaskChannel(newChanStr);
    
    const validOutcomes = callOutcomes?.length ? callOutcomes.map(o => o.name) : OUTCOMES;
    if (isInternal || isAsync || (outcome && (!isSuccessStatus(activeStatus) || !validOutcomes.includes(outcome as any)))) {
      setOutcome('');
    }
    
    if (newChanStr !== 'Email') setEmailSubject('');
    if (!isMessageChannel(newChanStr)) setWhatsappDraft('');
    if (newChanStr !== 'Meeting' && newChanStr !== 'Site Visit') setLocationOrLink('');
    
    setValidationError(null);
  };

  useEffect(() => {
    const interChanStr = interactionChannel as string;
    const isCall = isPhoneChannel(interChanStr);
    const available = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(interactionChannel);
    let activeStatus = status;
    if (available.length > 0 && !available.includes(status)) {
      activeStatus = available[0] as CallStatus;
      setStatus(activeStatus);
    }

    if (purpose === 'Discovery / Validation') {
      setPurpose('Discovery / Qualification');
    }

    const isAsyncChannel = isMessageChannel(interactionChannel) || interactionChannel.toLowerCase().includes('email');
    const isInternal = isInternalTaskChannel(interactionChannel);

    if (isInternal || isAsyncChannel) {
      if (outcome) setOutcome('');
    } else if (outcome && !isSuccessStatus(activeStatus)) {
      setOutcome('');
    }
  }, [interactionChannel, status, purpose, outcome, availablePurposes]);
  const [notes, setNotes] = useState<string>('');
  const [activityDate, setActivityDate] = useState<string>(() => getLocalDateTimeString());
  const [followupDate, setFollowupDate] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState<string>('');
  const [locationOrLink, setLocationOrLink] = useState<string>('');
  const [followupIntent, setFollowupIntent] = useState<string>('');
  const [isDnc, setIsDnc] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeChipId, setActiveChipId] = useState<string | null>(null);

  // Target Context State
  const [linkMode, setLinkMode] = useState<'crm' | 'unsaved'>('crm');
  const [unlinkedName, setUnlinkedName] = useState<string>('');
  const [unlinkedContactInfo, setUnlinkedContactInfo] = useState<string>('');

  // Dual-Level Express Lead Form State
  const makeExpressId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const [expressCompanyName, setExpressCompanyName] = useState<string>('');
  const [expressLegalSuffix, setExpressLegalSuffix] = useState<string>('None / To Be Added Later');
  const [expressCity, setExpressCity] = useState<string>('Dubai');
  const [expressIndustryParent, setExpressIndustryParent] = useState<string>('');
  const [expressIndustryType, setExpressIndustryType] = useState<string>('');
  const expressDistinctSubtypes = useMemo(() => getDistinctRawBusinessTypes(companies), [companies]);
  const [expressCountry, setExpressCountry] = useState<string>('United Arab Emirates');
  const [expressCompanyPhones, setExpressCompanyPhones] = useState<ExpressPhoneItem[]>(() => [
    { id: makeExpressId('ecp'), label: 'Main', number: '' }
  ]);
  const [expressCompanyEmails, setExpressCompanyEmails] = useState<ExpressEmailItem[]>(() => [
    { id: makeExpressId('ece'), label: 'Main', email: '' }
  ]);
  const [expressCompanyLinks, setExpressCompanyLinks] = useState<{ id: string; label: string; url: string }[]>(() => [{ id: makeExpressId('ecl'), label: 'Website', url: '' }]);

  const expressCompanyDup = useMemo(() => {
    if (!expressCompanyName || expressCompanyName.trim().length < 2) return null;
    const matchRes = findDuplicateCompany(expressCompanyName.trim(), companies);
    return matchRes ? matchRes.match : null;
  }, [expressCompanyName, companies]);

  const [expressContactName, setExpressContactName] = useState<string>('');
  const [expressContactRole, setExpressContactRole] = useState<string>('');
  const [expressContactPhones, setExpressContactPhones] = useState<ExpressPhoneItem[]>(() => [
    { id: makeExpressId('ctp'), label: 'Direct Line', number: '' }
  ]);
  const [expressContactEmails, setExpressContactEmails] = useState<ExpressEmailItem[]>(() => [
    { id: makeExpressId('cte'), label: 'Direct', email: '' }
  ]);

  const [expressRelationship, setExpressRelationship] = useState<string>('Prospect');
  const [expressTemperature, setExpressTemperature] = useState<'Cold' | 'Warm' | 'Hot'>('Cold');
  const [primaryDialedPhoneId, setPrimaryDialedPhoneId] = useState<string>('');
  const [crmTargetType, setCrmTargetType] = useState<'contact' | 'company_mainline'>('contact');
  const [mainlineTag, setMainlineTag] = useState<string>('Front Desk');

  const handleCycleTemperature = () => {
    setExpressTemperature((prev) => {
      if (prev === 'Cold') return 'Warm';
      if (prev === 'Warm') return 'Hot';
      return 'Cold';
    });
  };

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(companyId || '');
  const [selectedCompanyName, setSelectedCompanyName] = useState<string>(companyName || '');
  const [selectedContactId, setSelectedContactId] = useState<string>(contactId || '');
  const [selectedContactName, setSelectedContactName] = useState<string>(contactName || '');
  const [newContactDesignation, setNewContactDesignation] = useState<string>('');
  const [newPhoneTag, setNewPhoneTag] = useState<string>('Mobile');
  const [newContactPhoneTag, setNewContactPhoneTag] = useState<string>('Mobile');
  const [selectedContactPhone, setSelectedContactPhone] = useState<string>(contactPhone || '');
  const [selectedContactEmail, setSelectedContactEmail] = useState<string>('');
  const [isAddingNewContact, setIsAddingNewContact] = useState<boolean>(false);
  const [isAddingNewContactPhone, setIsAddingNewContactPhone] = useState<boolean>(false);
  const [isAddingNewCompanyLine, setIsAddingNewCompanyLine] = useState<boolean>(false);
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<string>(enquiryId || '');
  const [selectedEnquiryQuoteRef, setSelectedEnquiryQuoteRef] = useState<string>('');
  const [companySearchQuery, setCompanySearchQuery] = useState<string>('');
  const [isComboboxOpen, setIsComboboxOpen] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Voice Dictation State
  const [isListening, setIsListening] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);

  // --- Express Phone & Email Handlers ---
  const handleAddCompanyPhone = () => {
    setExpressCompanyPhones((prev) => [
      ...prev,
      { id: `ecp_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, label: 'Main', number: '' }
    ]);
  };

  const handleRemoveCompanyPhone = (id: string) => {
    setExpressCompanyPhones((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  };

  const handleCompanyPhoneChange = (id: string, field: 'label' | 'number', value: string) => {
    setExpressCompanyPhones((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleAddCompanyEmail = () => {
    setExpressCompanyEmails((prev) => [
      ...prev,
      { id: `ece_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, label: 'Main', email: '' }
    ]);
  };

  const handleRemoveCompanyEmail = (id: string) => {
    setExpressCompanyEmails((prev) => (prev.length > 1 ? prev.filter((e) => e.id !== id) : prev));
  };

  const handleCompanyEmailChange = (id: string, field: 'label' | 'email', value: string) => {
    setExpressCompanyEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const handleAddCompanyLink = () => setExpressCompanyLinks(prev => [...prev, { id: makeExpressId('ecl'), label: 'Website', url: '' }]);
  const handleRemoveCompanyLink = (id: string) => setExpressCompanyLinks(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  const handleCompanyLinkChange = (id: string, field: 'label' | 'url', value: string) => setExpressCompanyLinks(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));

  const handleAddContactPhone = () => {
    setExpressContactPhones((prev) => [
      ...prev,
      { id: `ctp_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, label: 'Direct Line', number: '' }
    ]);
  };

  const handleRemoveContactPhone = (id: string) => {
    setExpressContactPhones((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  };

  const handleContactPhoneChange = (id: string, field: 'label' | 'number', value: string) => {
    setExpressContactPhones((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleAddContactEmail = () => {
    setExpressContactEmails((prev) => [
      ...prev,
      { id: `cte_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, label: 'Direct', email: '' }
    ]);
  };

  const handleRemoveContactEmail = (id: string) => {
    setExpressContactEmails((prev) => (prev.length > 1 ? prev.filter((e) => e.id !== id) : prev));
  };

  const handleContactEmailChange = (id: string, field: 'label' | 'email', value: string) => {
    setExpressContactEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  // Context Cleanup & Initialization on Open or Prop Change
  useEffect(() => {
    if (isOpen) {
      const activeLog = existingLog || logToEdit;
      if (activeLog) {
        if (activeLog.unlinked_name || activeLog.unlinked_contact_info) {
          setLinkMode('unsaved');
          setUnlinkedName(activeLog.unlinked_name || '');
          setUnlinkedContactInfo(activeLog.unlinked_contact_info || '');

          setExpressCompanyName(activeLog.unlinked_name || '');
          const info = activeLog.unlinked_contact_info || '';
          if (info.includes('@')) {
            setExpressCompanyEmails([{ id: makeExpressId('ece'), label: 'Main', email: info }]);
            setExpressCompanyPhones([{ id: makeExpressId('ecp'), label: 'Main', number: '' }]);
          } else {
            setExpressCompanyPhones([{ id: makeExpressId('ecp'), label: 'Main', number: info }]);
            setExpressCompanyEmails([{ id: makeExpressId('ece'), label: 'Main', email: '' }]);
          }
          setExpressContactName('');
          setExpressContactRole('');
          setExpressContactPhones([{ id: makeExpressId('ctp'), label: 'Direct Line', number: '' }]);
          setExpressContactEmails([{ id: makeExpressId('cte'), label: 'Direct', email: '' }]);

          setSelectedCompanyId('');
          setSelectedCompanyName('');
          setSelectedContactId('');
          setSelectedContactName('');
          setSelectedContactPhone('');
          setSelectedEnquiryId('');
          setSelectedEnquiryQuoteRef('');
        } else {
          setLinkMode('crm');
          setUnlinkedName('');
          setUnlinkedContactInfo('');
          const targetCompId = activeLog.company_id || companyId || '';
          const matchedCompany = targetCompId && companies ? companies.find((c) => c.id === targetCompId) : null;
          const resolvedCompName = matchedCompany
            ? (matchedCompany.display_name || matchedCompany.canonical_name)
            : (activeLog.company_name || companyName || '');
          setSelectedCompanyId(targetCompId);
          setSelectedCompanyName(resolvedCompName);
          setSelectedContactId(activeLog.contact_id || contactId || '');
          setSelectedContactName(activeLog.contact_name || contactName || '');
          setSelectedContactPhone(activeLog.contact_phone || contactPhone || '');
          setSelectedEnquiryId(activeLog.enquiry_id || enquiryId || '');
          setSelectedEnquiryQuoteRef(activeLog.enquiry_quote_ref || '');
        }

        setChannel((activeLog.channel as ActivityChannel) || initialChannel || 'Call');
        setStatus(activeLog.status || initialStatus || 'Completed');
        setOutcome(activeLog.outcome || '');
        const normalizedPurp = activeLog.purpose === 'Discovery / Validation'
          ? 'Discovery / Qualification'
          : (activeLog.purpose || 'Discovery / Qualification');
        setPurpose(normalizedPurp);
        setNotes(activeLog.requirement_notes || (activeLog as any).notes || '');
        setWhatsappDraft(activeLog.whatsapp_draft || '');
        setEmailSubject(activeLog.email_subject || '');
        setLocationOrLink(activeLog.location_or_link || '');
        setFollowupIntent(activeLog.followup_intent || '');

        const logDateObj = activeLog.date ? new Date(activeLog.date) : new Date();
        setActivityDate(getLocalDateTimeString(isNaN(logDateObj.getTime()) ? new Date() : logDateObj));

        setFollowupDate(
          activeLog.next_followup_date
            ? formatToDatetimeLocal(activeLog.next_followup_date)
            : ''
        );
        setIsDnc(Boolean((activeLog as any).dnc || activeLog.is_dnc || (activeLog as any).opt_out));
        setActiveChipId(null);
        setAiError(null);
        setValidationError(null);
        setCompanySearchQuery('');
        setIsComboboxOpen(false);

        if (drawerMode === 'execute') {
          const now = new Date();
          const offset = now.getTimezoneOffset() * 60000;
          const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
          setActivityDate(localISOTime);
        }
      } else {
        setLinkMode('crm');
        setUnlinkedName('');
        setUnlinkedContactInfo('');

        setExpressCompanyName('');
        setExpressCompanyPhones([{ id: makeExpressId('ecp'), label: 'Main', number: '' }]);
        setExpressCompanyEmails([{ id: makeExpressId('ece'), label: 'Main', email: '' }]);
        setExpressCompanyLinks([{ id: makeExpressId('ecl'), label: 'Website', url: '' }]);
        setExpressContactName('');
        setExpressContactRole('');
        setExpressContactPhones([{ id: makeExpressId('ctp'), label: 'Direct Line', number: '' }]);
        setExpressContactEmails([{ id: makeExpressId('cte'), label: 'Direct', email: '' }]);

        const effChannel = normalizeActivityChannel(initialChannel || 'Call');
        setChannel(effChannel);
        setStatus(initialStatus || 'Completed');
        setOutcome('');
        setPurpose('Discovery / Qualification');
        setNotes('');
        setActivityDate(getLocalDateTimeString());
        setFollowupDate('');
        setEmailSubject('');
        setLocationOrLink('');
        setFollowupIntent('');
        setIsDnc(false);
        setActiveChipId(null);
        setWhatsappDraft('');
        setAiError(null);
        setValidationError(null);
        setCompanySearchQuery('');
        setIsComboboxOpen(false);

        const effTargetType = targetType || (contactId ? 'contact' : (contactPhone ? 'company_mainline' : 'contact'));
        setCrmTargetType(effTargetType);

        setSelectedCompanyId(companyId || '');
        setSelectedCompanyName(companyName || '');
        setSelectedContactId(contactId || '');
        setSelectedContactName(contactName || '');
        setSelectedContactPhone(contactPhone || '');
        setSelectedContactEmail(contactEmail || '');
        setSelectedEnquiryId(enquiryId || '');
        setSelectedEnquiryQuoteRef('');
        setNewContactDesignation('');
        setNewPhoneTag('Mobile');
        setNewContactPhoneTag('Mobile');
      }
    }
  }, [
    isOpen,
    existingLog,
    logToEdit,
    drawerMode,
    companyId,
    companyName,
    contactId,
    contactName,
    contactPhone,
    contactEmail,
    targetType,
    enquiryId,
    initialChannel,
    initialStatus
  ]);

  // Resolve Company Name if companyId is set
  useEffect(() => {
    if (!isOpen || !selectedCompanyId) return;
    const matchComp = (companies || []).find((c) => c.id === selectedCompanyId);
    if (matchComp) {
      setSelectedCompanyName(matchComp.display_name || matchComp.canonical_name);
    }
  }, [isOpen, selectedCompanyId, companies]);

  // Strict target company switch tracking to prevent zombie contact state
  const prevSelectedCompanyIdRef = useRef<string>(selectedCompanyId);
  useEffect(() => {
    if (!isOpen) {
      prevSelectedCompanyIdRef.current = selectedCompanyId;
      return;
    }
    if (prevSelectedCompanyIdRef.current !== selectedCompanyId) {
      setSelectedContactId('');
      setSelectedContactName('');
      setSelectedContactPhone('');
      setSelectedContactEmail('');
      setSelectedEnquiryId('');
      setSelectedEnquiryQuoteRef('');
      setIsAddingNewContact(false);
      setIsAddingNewContactPhone(false);
      setIsAddingNewCompanyLine(false);
      setNewContactDesignation('');
      setNewPhoneTag('Mobile');
      setNewContactPhoneTag('Mobile');
      prevSelectedCompanyIdRef.current = selectedCompanyId;
    }
  }, [isOpen, selectedCompanyId]);

  // Automatic Primary Contact & Phone Lookup
  useEffect(() => {
    if (!isOpen || !selectedCompanyId) {
      if (!companyId) {
        setSelectedContactId('');
        setSelectedContactName('');
        setSelectedContactPhone('');
        setSelectedContactEmail('');
      }
      return;
    }

    // Do not force contact lookup if targeting company mainline directly
    if (crmTargetType === 'company_mainline') {
      return;
    }

    const companyContacts = (contacts || []).filter(
      (c) => c.company_id === selectedCompanyId || c.company_ids?.includes(selectedCompanyId)
    );

    if (companyContacts.length > 0) {
      const currentCt = companyContacts.find((c) => c.id === selectedContactId);
      if (currentCt) {
        setSelectedContactName(currentCt.full_name || '');
        if (!selectedContactPhone) {
          const phones = getContactPhones(currentCt);
          setSelectedContactPhone(currentCt.mobile || currentCt.landline || phones[0]?.number || '');
        }
        if (!selectedContactEmail) {
          const emails = getContactEmails(currentCt);
          setSelectedContactEmail(currentCt.email || emails[0]?.email || '');
        }
      } else if (!contactId && !contactPhone) {
        const primary = companyContacts.find((c) => c.is_primary) || companyContacts[0];
        if (primary) {
          setSelectedContactId(primary.id || '');
          setSelectedContactName(primary.full_name || '');
          const phones = getContactPhones(primary);
          setSelectedContactPhone(primary.mobile || primary.landline || phones[0]?.number || '');
          const emails = getContactEmails(primary);
          setSelectedContactEmail(primary.email || emails[0]?.email || '');
        } else {
          setSelectedContactId('');
          setSelectedContactName('');
          setSelectedContactPhone('');
          setSelectedContactEmail('');
        }
      }
    } else {
      // Company has no contacts: strictly clear zombie contact selection!
      setSelectedContactId('');
      setSelectedContactName('');
      setSelectedContactPhone('');
      setSelectedContactEmail('');
    }
  }, [isOpen, selectedCompanyId, contacts, crmTargetType]);

  // Automatic Quote Reference Resolution
  useEffect(() => {
    if (!isOpen) return;
    if (selectedEnquiryId) {
      const enq = (enquiries || []).find((e) => e.id === selectedEnquiryId);
      if (enq) {
        setSelectedEnquiryQuoteRef(enq.quote_ref_no || '');
        if (!selectedCompanyId && enq.company_id) {
          setSelectedCompanyId(enq.company_id);
        }
      }
    } else {
      setSelectedEnquiryQuoteRef('');
    }
  }, [isOpen, selectedEnquiryId, enquiries, selectedCompanyId]);

  // Filtered companies for uncontextualized global flow
  const filteredCompanies = useMemo(() => {
    if (!companySearchQuery.trim()) return (companies || []).slice(0, 8);
    const q = companySearchQuery.toLowerCase().trim();
    return (companies || [])
      .filter((c) => {
        const name = (c.display_name || c.canonical_name || '').toLowerCase();
        const aliases = (c.aliases || []).join(' ').toLowerCase();
        return name.includes(q) || aliases.includes(q);
      })
      .slice(0, 10);
  }, [companies, companySearchQuery]);

  const handleSelectCompany = (comp: Company) => {
    setSelectedCompanyId(comp.id || '');
    setSelectedCompanyName(comp.display_name || comp.canonical_name);
    setCompanySearchQuery('');
    setIsComboboxOpen(false);
    setValidationError(null);

    setSelectedContactId('');
    setSelectedContactName('');
    setSelectedContactPhone('');
    setSelectedContactEmail('');
    setSelectedEnquiryId('');
    setSelectedEnquiryQuoteRef('');
    setIsAddingNewContact(false);
    setIsAddingNewContactPhone(false);
    setIsAddingNewCompanyLine(false);
    setNewContactDesignation('');
    setNewPhoneTag('Mobile');
    setNewContactPhoneTag('Mobile');
  };

  const availableCompanyContacts = useMemo(() => {
    if (!selectedCompanyId) return [];
    return (contacts || []).filter((c) => c.company_id === selectedCompanyId || c.company_ids?.includes(selectedCompanyId));
  }, [contacts, selectedCompanyId]);

  const selectedContactObj = useMemo(() => {
    if (!selectedContactId) return null;
    return availableCompanyContacts.find((c) => c.id === selectedContactId) || null;
  }, [availableCompanyContacts, selectedContactId]);

  const selectedContactSavedNumbers = useMemo(() => {
    if (!selectedContactObj) return [];
    const list: Array<{ number: string; label: string }> = [];
    const cPhones = getContactPhones(selectedContactObj);
    if (selectedContactObj.mobile) {
      list.push({ number: selectedContactObj.mobile, label: 'Mobile' });
    }
    if (selectedContactObj.landline) {
      list.push({ number: selectedContactObj.landline, label: 'Landline' });
    }
    cPhones.forEach((p) => {
      if (p.number && !list.some((existing) => isSamePhoneNumber(existing.number, p.number))) {
        list.push({ number: p.number, label: p.label || 'Direct' });
      }
    });
    return list;
  }, [selectedContactObj]);

  const selectedCompanyObj = useMemo(() => {
    if (!selectedCompanyId) return null;
    return companies.find((c) => c.id === selectedCompanyId) || null;
  }, [companies, selectedCompanyId]);

  const handleUpdateCompanyTemperature = async (newTemp: 'Cold' | 'Warm' | 'Hot' | 'DNC') => {
    const targetId = selectedCompanyId || companyId;
    if (!targetId) return;
    const comp = selectedCompanyObj || (companies || []).find((c) => c.id === targetId);
    if (!comp) return;

    const isDnc = newTemp === 'DNC';
    const updatedComp: Company = {
      ...comp,
      temperature: isDnc ? 'DNC' : newTemp,
      is_dnc: isDnc,
      updatedAt: new Date().toISOString()
    };

    if (setCompanies) {
      setCompanies((prev) => prev.map((c) => (c.id === targetId ? updatedComp : c)));
    }
    if (onUpdateCompany) {
      onUpdateCompany(updatedComp);
    }
    await safeSetDoc('companies', targetId, updatedComp);
    await CompanyRepository.saveCompany(updatedComp);
  };

  const companyMainlines = useMemo(() => {
    if (!selectedCompanyObj) return [];
    const list: Array<{ number: string; label: string }> = [];
    const compPhones = getCompanyPhones(selectedCompanyObj);
    if (selectedCompanyObj.general_phone) {
      list.push({ number: selectedCompanyObj.general_phone, label: 'Main' });
    }
    compPhones.forEach((p) => {
      if (p.number && !list.some((existing) => isSamePhoneNumber(existing.number, p.number))) {
        // Exclude mobile and direct line labels for company mainline
        const lbl = (p.label || '').toLowerCase();
        if (lbl.includes('mobile') || lbl.includes('direct') || lbl.includes('personal')) {
          return;
        }
        list.push({ number: p.number, label: p.label || 'Front Desk' });
      }
    });
    return list;
  }, [selectedCompanyObj]);

  const handleSelectContact = (cId: string) => {
    setSelectedContactId(cId);
    const found = availableCompanyContacts.find((c) => c.id === cId);
    if (found) {
      setSelectedContactName(found.full_name || '');
      const phones = getContactPhones(found);
      const firstPhone = found.mobile || found.landline || phones[0]?.number || '';
      setSelectedContactPhone(firstPhone);
      setSelectedContactEmail(found.email || '');
      setIsAddingNewContactPhone(false);
    } else {
      setSelectedContactName('');
      setSelectedContactPhone('');
      setSelectedContactEmail('');
      setIsAddingNewContactPhone(false);
    }
  };

  const availableCompanyEnquiries = useMemo(() => {
    if (!selectedCompanyId) return [];
    return (enquiries || []).filter((e) => e.company_id === selectedCompanyId);
  }, [enquiries, selectedCompanyId]);

  const handleSelectEnquiry = (eId: string) => {
    setSelectedEnquiryId(eId);
    const enq = availableCompanyEnquiries.find((e) => e.id === eId);
    if (enq) {
      setSelectedEnquiryQuoteRef(enq.quote_ref_no || '');
    } else {
      setSelectedEnquiryQuoteRef('');
    }
  };

  const renderPhoneActionButton = (phoneNumber: string) => {
    const trimmed = (phoneNumber || '').trim();
    if (!trimmed) return null;

    const isMsg = isMessageChannel(channel);
    const sanitizedNumber = trimmed.replace(/[^\d+]/g, '');

    const handleAction = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isMsg) {
        window.open(getWhatsAppUrl(trimmed), '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = `tel:${sanitizedNumber}`;
      }
    };

    return (
      <button
        type="button"
        onClick={handleAction}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/40 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
        title={isMsg ? `WhatsApp ${trimmed}` : `Call ${trimmed}`}
      >
        {isMsg ? (
          <MessageSquare className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        ) : (
          <Phone className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
        )}
        <span>{isMsg ? 'WhatsApp' : 'Call'}</span>
      </button>
    );
  };

  // AI Assist State
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [isDraftingWhatsapp, setIsDraftingWhatsapp] = useState<boolean>(false);
  const [whatsappDraft, setWhatsappDraft] = useState<string>('');
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [copiedWhatsapp, setCopiedWhatsapp] = useState<boolean>(false);

  // Web Speech API Voice Dictation Setup
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        if (currentTranscript) {
          setNotes((prev) => (prev ? `${prev} ${currentTranscript}` : currentTranscript));
        }
      };

      recognitionRef.current.onerror = (err: any) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const handleAiAssist = async (action: 'summarize_notes' | 'draft_whatsapp') => {
    if (action === 'summarize_notes') setIsSummarizing(true);
    if (action === 'draft_whatsapp') setIsDraftingWhatsapp(true);
    setAiError(null);

    try {
      const response = await fetch('/api/ai/quick-activity-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          companyName: selectedCompanyName || companyName || expressCompanyName,
          contactName: selectedContactName || contactName || expressContactName,
          channel,
          outcome,
          purpose,
          notes,
          salespersonName: currentUserInitials
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.needsApiKey || response.status === 429) {
          setAiError('Gemini API quota depleted. Please configure a personal API key.');
          setShowGeminiKeyModal(true);
        } else {
          setAiError(data.error || 'AI request failed. Please try again.');
        }
        return;
      }

      if (action === 'summarize_notes' && data.result) {
        setNotes(data.result);
      } else if (action === 'draft_whatsapp' && data.result) {
        setWhatsappDraft(data.result);
      }
    } catch (err: any) {
      console.error('Error during AI Assist fetch:', err);
      setAiError('Network error or server unavailable. Please try again.');
    } finally {
      setIsSummarizing(false);
      setIsDraftingWhatsapp(false);
    }
  };

  const handleCopyAndSendWhatsapp = () => {
    if (!whatsappDraft) return;
    navigator.clipboard.writeText(whatsappDraft);
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 2500);

    const rawTargetPhone = selectedContactPhone || expressContactPhones[0]?.number || expressCompanyPhones[0]?.number || '';
    const targetUrl = getWhatsAppUrl(rawTargetPhone, whatsappDraft);
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('Failed to start recognition:', err);
      }
    }
  };

  const handleReset = () => {
    setLinkMode('crm');
    setUnlinkedName('');
    setUnlinkedContactInfo('');

    setExpressCompanyName('');
    setExpressCompanyPhones([{ id: makeExpressId('ecp'), label: 'Main', number: '' }]);
    setExpressCompanyEmails([{ id: makeExpressId('ece'), label: 'Main', email: '' }]);
    setExpressCompanyLinks([{ id: makeExpressId('ecl'), label: 'Website', url: '' }]);
    setExpressContactName('');
    setExpressContactRole('');
    setExpressContactPhones([{ id: makeExpressId('ctp'), label: 'Direct Line', number: '' }]);
    setExpressContactEmails([{ id: makeExpressId('cte'), label: 'Direct', email: '' }]);

    setChannel('Call');
    setOutcome('');
    setStatus('Completed');
    setPurpose('Discovery / Qualification');
    setNotes('');
    setActivityDate(new Date().toISOString().slice(0, 16));
    setFollowupDate('');
    setIsDnc(false);
    setActiveChipId(null);
    setWhatsappDraft('');
    setAiError(null);
    setValidationError(null);
    setCompanySearchQuery('');
    setIsComboboxOpen(false);

    setSelectedCompanyId(companyId || '');
    setSelectedCompanyName(companyName || '');
    setSelectedContactId(contactId || '');
    setSelectedContactName(contactName || '');
    setSelectedContactPhone(contactPhone || '');
    setSelectedEnquiryId(enquiryId || '');
    setSelectedEnquiryQuoteRef('');
    setIsAddingNewContact(false);
    setIsAddingNewContactPhone(false);
    setIsAddingNewCompanyLine(false);
    setNewContactDesignation('');
    setNewPhoneTag('Mobile');
    setNewContactPhoneTag('Mobile');

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (linkMode === 'crm') {
      if (!selectedCompanyId) {
        setValidationError('Please select a company or CRM contact before saving an activity.');
        return;
      }
      const hasContactSelection = Boolean(selectedContactId || selectedContactName);
      if (!hasContactSelection && !selectedCompanyName) {
        setValidationError('Lead required: Please select a CRM Contact or enter an Unsaved Lead Name before scheduling or saving.');
        return;
      }
    } else {
      // Express / Unsaved Lead Validation
      const hasCompName = Boolean(expressCompanyName.trim());
      const hasContactName = Boolean(expressContactName.trim());
      const hasCompPhone = expressCompanyPhones.some((p) => p.number.trim() !== '');
      const hasCompEmail = expressCompanyEmails.some((e) => e.email.trim() !== '');
      const hasContactPhone = expressContactPhones.some((p) => p.number.trim() !== '');
      const hasContactEmail = expressContactEmails.some((e) => e.email.trim() !== '');
      const hasLegacy = Boolean(unlinkedName.trim() || unlinkedContactInfo.trim());

      if (!hasCompName && !hasContactName && !hasCompPhone && !hasCompEmail && !hasContactPhone && !hasContactEmail && !hasLegacy) {
        setValidationError('Lead required: Please enter Company Name, Contact Person Name, or Phone/Email before saving.');
        return;
      }
    }

    const isInternalTask = isInternalTaskChannel(channel);
    const normChan = channel.toLowerCase();
    const isAsyncChannel = !!normChan.match(/email|message|whatsapp|sms/);
    const isOutcomeRequired = !isAsyncChannel && !isInternalTask;

    if (isCompletedState && isOutcomeRequired && (!outcome || !outcome.trim())) {
      setValidationError('Please select an outcome for this completed activity.');
      return;
    }

    setValidationError(null);

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const interactionTypeMap: Record<string, 'call' | 'email' | 'message'> = {
        Call: 'call',
        'Phone Call': 'call',
        WhatsApp: 'message',
        Message: 'message',
        'Message (WhatsApp/SMS)': 'message',
        Email: 'email',
        Meeting: 'call',
        'Meeting (Virtual/In-Person)': 'call',
        'Site Visit': 'call',
        'Internal Task / Admin': 'call',
        Task: 'call',
        internal_task: 'call'
      };

      const isInvalidNumberCall =
        isPhoneChannel(channel) &&
        (status === 'Invalid Number' ||
         status === 'Dead / Invalid Number' ||
         status?.toLowerCase().includes('invalid number') ||
         status?.toLowerCase() === 'invalid' ||
         outcome === 'Dead / Invalid Number' ||
         outcome === 'Wrong Number / Invalid' ||
         outcome?.toLowerCase().includes('invalid number') ||
         outcome?.toLowerCase().includes('invalid'));

      const isDncOptOut =
        !isInvalidNumberCall &&
        (isDnc ||
        status === ('dnc_opt_out' as any) ||
        outcome === 'dnc_opt_out' ||
        (Boolean(outcome) && (
          outcome.toLowerCase().includes('dnc') ||
          outcome.toLowerCase().includes('opt-out') ||
          outcome.toLowerCase().includes('opt_out')
        )));

      const userUid = currentUserUid || user?.uid || '';
      const userName = currentUserName || user?.full_name || user?.username || user?.email || currentUserInitials || 'System';

      const activityIsoDate = activityDate ? new Date(activityDate).toISOString() : nowIso;
      const followupIsoDate = followupDate ? new Date(followupDate).toISOString() : undefined;

      if (!activeWorkspaceId) {
        setIsSubmitting(false);
        throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
      }

      // --- Seamless Auto-CRM Generation & Linking Logic ---
      let resolvedCompanyId: string | undefined = undefined;
      let resolvedCompanyName: string | undefined = undefined;
      let resolvedContactId: string | undefined = undefined;
      let resolvedContactName: string | undefined = undefined;
      let resolvedContactPhone: string | undefined = undefined;
      let resolvedUnlinkedName: string | undefined = undefined;
      let resolvedUnlinkedInfo: string | undefined = undefined;

      if (linkMode === 'crm') {
        resolvedCompanyId = selectedCompanyId || undefined;
        resolvedCompanyName = selectedCompanyName || undefined;

        if (crmTargetType === 'company_mainline') {
          // Strict decoupling: bypass contact creation / updating entirely
          resolvedContactId = undefined;
          resolvedContactName = undefined;
          resolvedContactPhone = selectedContactPhone ? selectedContactPhone.trim() : undefined;

          if (selectedCompanyId) {
            let targetComp = companies.find((c) => c.id === selectedCompanyId);
            if (targetComp) {
              let compUpdated = false;
              let updatedComp = { ...targetComp };

              // 1. Append/enrich phone on company
              if (selectedContactPhone && selectedContactPhone.trim()) {
                const phoneTrim = selectedContactPhone.trim();
                if (!updatedComp.general_phone) {
                  updatedComp.general_phone = phoneTrim;
                  compUpdated = true;
                }
                const existingPhones = getCompanyPhones(targetComp);
                if (!existingPhones.some((p) => isSamePhoneNumber(p.number || p.value, phoneTrim))) {
                  const tagLabel = mainlineTag.trim() || 'Front Desk';
                  const newPhoneObj = {
                    id: `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    label: tagLabel,
                    number: phoneTrim,
                    value: phoneTrim
                  };
                  updatedComp.phones = [...(updatedComp.phones || []), newPhoneObj];
                  updatedComp.general_phones = [...(updatedComp.general_phones || []), newPhoneObj];
                  compUpdated = true;
                }
              }

              // 2. Append/enrich email on company
              if (selectedContactEmail && selectedContactEmail.trim()) {
                const emailTrim = selectedContactEmail.trim().toLowerCase();
                if (!updatedComp.general_email) {
                  updatedComp.general_email = emailTrim;
                  compUpdated = true;
                }
                const existingEmails = getCompanyEmails(targetComp);
                if (!existingEmails.some((e) => (e.email || e.value || '').toLowerCase() === emailTrim)) {
                  const newEmailObj = {
                    id: `email_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    label: 'Main',
                    email: selectedContactEmail.trim(),
                    value: selectedContactEmail.trim()
                  };
                  updatedComp.emails = [...(updatedComp.emails || []), newEmailObj];
                  updatedComp.general_emails = [...(updatedComp.general_emails || []), newEmailObj];
                  compUpdated = true;
                }
              }

              if (isInvalidNumberCall && selectedContactPhone && selectedContactPhone.trim()) {
                const phoneTrim = selectedContactPhone.trim();
                updatedComp.restricted_lines = {
                  ...(updatedComp.restricted_lines || {}),
                  [phoneTrim]: 'Invalid'
                };
                compUpdated = true;
              }

              if (compUpdated) {
                updatedComp.updatedAt = nowIso;
                await safeSetDoc('companies', selectedCompanyId, updatedComp);
                await CompanyRepository.updateCompany(selectedCompanyId, updatedComp);
                await CompanyRepository.saveCompany(updatedComp);
                if (setCompanies) {
                  setCompanies((prev) => prev.map((c) => (c.id === selectedCompanyId ? updatedComp : c)));
                }
                if (onUpdateCompany) {
                  onUpdateCompany(updatedComp);
                }
              }
            }
          }
        } else {
          // crmTargetType === 'contact'
          resolvedContactId = selectedContactId || undefined;
          resolvedContactName = selectedContactName || undefined;
          resolvedContactPhone = selectedContactPhone || undefined;

          // Auto-append new contact/phone/email to master company if provided
          if (selectedCompanyId) {
            let targetComp = companies.find((c) => c.id === selectedCompanyId);
            if (targetComp) {
              let compUpdated = false;
              let updatedComp = { ...targetComp };

              // 1. Append phone if new
              if (selectedContactPhone && selectedContactPhone.trim()) {
                const phoneTrim = selectedContactPhone.trim();
                const existingPhones = getCompanyPhones(targetComp);
                if (!existingPhones.some((p) => isSamePhoneNumber(p.number || p.value, phoneTrim))) {
                  const tagLabel = isAddingNewCompanyLine ? (mainlineTag.trim() || 'Front Desk') : 'Direct Line';
                  const newPhoneObj = {
                    id: `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    label: tagLabel,
                    number: phoneTrim,
                    value: phoneTrim
                  };
                  updatedComp.phones = [...(updatedComp.phones || []), newPhoneObj];
                  updatedComp.general_phones = [...(updatedComp.general_phones || []), newPhoneObj];
                  compUpdated = true;
                }
              }

              // 2. Append email if new
              if (selectedContactEmail && selectedContactEmail.trim()) {
                const emailTrim = selectedContactEmail.trim().toLowerCase();
                const existingEmails = getCompanyEmails(targetComp);
                if (!existingEmails.some((e) => (e.email || e.value || '').toLowerCase() === emailTrim)) {
                  const newEmailObj = {
                    id: `email_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    label: 'Direct',
                    email: selectedContactEmail.trim(),
                    value: selectedContactEmail.trim()
                  };
                  updatedComp.emails = [...(updatedComp.emails || []), newEmailObj];
                  updatedComp.general_emails = [...(updatedComp.general_emails || []), newEmailObj];
                  compUpdated = true;
                }
              }

              if (isInvalidNumberCall && selectedContactPhone && selectedContactPhone.trim()) {
                const phoneTrim = selectedContactPhone.trim();
                updatedComp.restricted_lines = {
                  ...(updatedComp.restricted_lines || {}),
                  [phoneTrim]: 'Invalid'
                };
                compUpdated = true;
              }

              if (compUpdated) {
                updatedComp.updatedAt = nowIso;
                await safeSetDoc('companies', selectedCompanyId, updatedComp);
                await CompanyRepository.updateCompany(selectedCompanyId, updatedComp);
                await CompanyRepository.saveCompany(updatedComp);
                if (setCompanies) {
                  setCompanies((prev) => prev.map((c) => (c.id === selectedCompanyId ? updatedComp : c)));
                }
                if (onUpdateCompany) {
                  onUpdateCompany(updatedComp);
                }
              }

              // 3. Append contact person or upstream sync to existing contact
              const hasContactInput = Boolean(
                selectedContactId ||
                isAddingNewContact ||
                (selectedContactName && selectedContactName.trim())
              );

              if (hasContactInput) {
                const contactTrim = (selectedContactName || '').trim();
                const newPhone = (selectedContactPhone || '').trim();

                // Determine if this is an existing contact or a brand new contact
                let existingContact: Contact | null = null;
                if (selectedContactId) {
                  const localContacts = await CompanyRepository.getContactsLocal();
                  existingContact = localContacts.find((ct) => ct.id === selectedContactId) ||
                    (contacts || []).find((ct) => ct.id === selectedContactId) || null;
                } else if (!isAddingNewContact && contactTrim) {
                  const localContacts = await CompanyRepository.getContactsLocal();
                  existingContact = localContacts.find(
                    (ct) => (ct.company_id === selectedCompanyId || (ct as any).company_ids?.includes(selectedCompanyId)) &&
                            (ct.full_name || '').toLowerCase() === contactTrim.toLowerCase()
                  ) || (contacts || []).find(
                    (ct) => (ct.company_id === selectedCompanyId || (ct as any).company_ids?.includes(selectedCompanyId)) &&
                            (ct.full_name || '').toLowerCase() === contactTrim.toLowerCase()
                  ) || null;
                }

                if (!existingContact) {
                  // SCENARIO A: Brand New Contact Creation
                  const newContactId = `cont_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                  const isInvalid = isInvalidNumberCall || status === 'Invalid Number';
                  const initialPhoneObj = newPhone ? [{
                    id: `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    number: newPhone,
                    value: newPhone,
                    tag: newPhoneTag || 'Mobile',
                    label: newPhoneTag || 'Mobile',
                    isInvalid: isInvalid,
                    is_invalid: isInvalid
                  }] : [];

                  const newContact: Contact = {
                    id: newContactId,
                    company_id: selectedCompanyId,
                    workspace_id: activeWorkspaceId,
                    full_name: contactTrim || `${targetComp.display_name || targetComp.canonical_name} Representative`,
                    designation: newContactDesignation ? newContactDesignation.trim() : undefined,
                    mobile: newPhone,
                    phone: newPhone,
                    phones: initialPhoneObj,
                    email: selectedContactEmail ? selectedContactEmail.trim() : '',
                    emails: selectedContactEmail ? [{ id: `email_${Date.now()}`, label: 'Direct', email: selectedContactEmail.trim() }] : [],
                    is_primary: false,
                    is_dnc: isDnc || isDncOptOut,
                    dnc: isDnc || isDncOptOut,
                    ...(isDnc || isDncOptOut ? { dnc_reason: 'Opt-Out from Activity Log' } : {}),
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    ...(isInvalid && newPhone ? {
                      restricted_lines: { [newPhone]: 'Invalid' }
                    } : {})
                  };

                  await safeSetDoc('contacts', newContactId, newContact);
                  await CompanyRepository.saveContact(newContact);
                  resolvedContactId = newContactId;
                  resolvedContactName = newContact.full_name;
                  resolvedContactPhone = newPhone;

                  if (setContacts) {
                    setContacts((prev) => [newContact, ...prev.filter((c) => c.id !== newContactId)]);
                  }
                  if (onUpdateContact) {
                    onUpdateContact(newContact);
                  }
                } else {
                  // SCENARIO B & C: Existing Contact Updates (Upstream Sync)
                  let updatedCt: Contact = { ...existingContact };
                  let ctChanged = false;
                  const isInvalid = isInvalidNumberCall || status === 'Invalid Number';

                  if (isAddingNewContactPhone) {
                    // Scenario B: Append new manual phone number
                    if (newPhone) {
                      const existingPhones = getContactPhones(updatedCt);
                      const exists = existingPhones.some((p) => isSamePhoneNumber(p.number || p.value, newPhone));
                      if (!exists) {
                        const newPhoneObj = {
                          id: `phone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                          number: newPhone,
                          value: newPhone,
                          tag: newPhoneTag || 'Mobile',
                          label: newPhoneTag || 'Mobile',
                          isInvalid: isInvalid,
                          is_invalid: isInvalid
                        };
                        updatedCt.phones = [...(updatedCt.phones || []), newPhoneObj];
                        if (!updatedCt.mobile) updatedCt.mobile = newPhone;
                        ctChanged = true;
                      } else {
                        if (isInvalid) {
                          updatedCt.phones = (updatedCt.phones || []).map((p: any) => {
                            if (isSamePhoneNumber(p.number || p.value, newPhone)) {
                              return { ...p, isInvalid: true, is_invalid: true };
                            }
                            return p;
                          });
                          ctChanged = true;
                        }
                      }
                    }
                  } else {
                    // Scenario C: Using an existing number
                    if (isInvalid && newPhone) {
                      let matchedInArray = false;
                      if (updatedCt.phones && updatedCt.phones.length > 0) {
                        updatedCt.phones = updatedCt.phones.map((p: any) => {
                          if (isSamePhoneNumber(p.number || p.value, newPhone)) {
                            matchedInArray = true;
                            return { ...p, isInvalid: true, is_invalid: true };
                          }
                          return p;
                        });
                        ctChanged = true;
                      }
                      if (!matchedInArray && (isSamePhoneNumber(updatedCt.mobile, newPhone) || isSamePhoneNumber(updatedCt.landline, newPhone))) {
                        updatedCt.phones = [
                          ...(updatedCt.phones || []),
                          {
                            id: `phone_${Date.now()}`,
                            number: newPhone,
                            value: newPhone,
                            tag: 'Mobile',
                            label: 'Mobile',
                            isInvalid: true,
                            is_invalid: true
                          }
                        ];
                        ctChanged = true;
                      }
                    }
                  }

                  // Restricted lines sync for invalid number
                  if (isInvalid && newPhone) {
                    updatedCt.restricted_lines = {
                      ...(updatedCt.restricted_lines || {}),
                      [newPhone]: 'Invalid'
                    };
                    ctChanged = true;
                  }

                  // DNC CHECK: Regardless of whether the phone is new or existing
                  if (isDnc || isDncOptOut) {
                    updatedCt.is_dnc = true;
                    updatedCt.dnc = true;
                    updatedCt.dnc_reason = updatedCt.dnc_reason || 'Opt-Out from Activity Log';
                    ctChanged = true;
                  }

                  // Designation sync if updated
                  if (newContactDesignation && newContactDesignation.trim() && newContactDesignation.trim() !== updatedCt.designation) {
                    updatedCt.designation = newContactDesignation.trim();
                    ctChanged = true;
                  }

                  // Email sync if new
                  if (selectedContactEmail && selectedContactEmail.trim()) {
                    const eTrim = selectedContactEmail.trim().toLowerCase();
                    const existingEmails = getContactEmails(updatedCt);
                    if (!existingEmails.some((e) => (e.email || e.value || '').toLowerCase() === eTrim)) {
                      const newEmailObj = { id: `email_${Date.now()}`, label: 'Direct', email: selectedContactEmail.trim() };
                      updatedCt.emails = [...(updatedCt.emails || []), newEmailObj];
                      if (!updatedCt.email) updatedCt.email = selectedContactEmail.trim();
                      ctChanged = true;
                    }
                  }

                  // Upstream sync to database
                  if (ctChanged) {
                    updatedCt.updatedAt = nowIso;
                    await safeSetDoc('contacts', updatedCt.id!, updatedCt);
                    await CompanyRepository.saveContact(updatedCt);
                    if (setContacts) {
                      setContacts((prev) => prev.map((c) => (c.id === updatedCt.id ? updatedCt : c)));
                    }
                    if (onUpdateContact) {
                      onUpdateContact(updatedCt);
                    }
                  }

                  resolvedContactId = updatedCt.id;
                  resolvedContactName = updatedCt.full_name;
                  resolvedContactPhone = newPhone || updatedCt.mobile || (updatedCt.phones && updatedCt.phones[0]?.number);
                }
              }
            }
          }
        }
      } else {
        const compName = expressCompanyName.trim();
        const validCompPhones = expressCompanyPhones.filter((p) => p.number.trim() !== '');
        const validCompEmails = expressCompanyEmails.filter((e) => e.email.trim() !== '');
        const validCompLinks = expressCompanyLinks.filter((l) => l.url.trim() !== '');

        const cName = expressContactName.trim();
        const cRole = expressContactRole.trim();
        const validContactPhones = expressContactPhones.filter((p) => p.number.trim() !== '');
        const validContactEmails = expressContactEmails.filter((e) => e.email.trim() !== '');

        // Determine dialed phone based on explicit primaryDialedPhoneId selection
        const allPhones = [...expressCompanyPhones, ...expressContactPhones];
        const selectedDialedObj = allPhones.find((p) => p.id === primaryDialedPhoneId && p.number.trim());

        // Strictly isolate company payload from contact person payload
        const primaryCompPhone = validCompPhones[0]?.number.trim() || '';
        const primaryCompEmail = validCompEmails[0]?.email.trim() || '';

        const primaryContactPhone = validContactPhones[0]?.number.trim() || '';
        const primaryContactEmail = validContactEmails[0]?.email.trim() || '';

        const dialedPhone = selectedDialedObj
          ? selectedDialedObj.number.trim()
          : primaryContactPhone || primaryCompPhone;

        if (compName) {
          // 1. Check or Create Company
          let targetComp: Company | null = null;
          const dupMatch = findDuplicateCompany(compName, companies);
          if (dupMatch) {
            targetComp = dupMatch.match;
          } else {
            targetComp = companies.find(
              (c) => (c.display_name || c.canonical_name || '').toLowerCase() === compName.toLowerCase()
            ) || null;
          }

          let targetCompId = targetComp?.id;

          if (!targetComp) {
            targetCompId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const newComp: Company = {
              id: targetCompId,
              workspace_id: activeWorkspaceId,
              canonical_name: compName,
              display_name: compName,
              legal_suffix: expressLegalSuffix || 'None / To Be Added Later',
              aliases: [],
              country: expressCountry || 'United Arab Emirates',
              city: expressCity || 'Dubai',
              general_phone: primaryCompPhone,
              general_email: primaryCompEmail,
              phones: validCompPhones.map((p) => ({ id: p.id, label: p.label || 'Main', number: p.number.trim() })),
              emails: validCompEmails.map((e) => ({ id: e.id, label: e.label || 'Main', email: e.email.trim() })),
              links: validCompLinks.map(l => ({ id: l.id, label: l.label || 'Website', url: l.url.trim() })),
              industry_parent: expressIndustryParent || undefined,
              business_type_raw: expressIndustryType.trim() || undefined,
              industry: expressIndustryType.trim() || undefined,
              industry_type: expressIndustryType.trim() || undefined,
              relationship: expressRelationship || 'Prospect',
              temperature: expressTemperature || 'Cold',
              createdAt: nowIso,
              updatedAt: nowIso
            };

            if (isInvalidNumberCall && dialedPhone) {
              newComp.restricted_lines = {
                ...(newComp.restricted_lines || {}),
                [dialedPhone]: 'Invalid'
              };
            }

            await safeSetDoc('companies', targetCompId, newComp);
            await CompanyRepository.saveCompany(newComp);
            targetComp = newComp;

            if (setCompanies) {
              setCompanies((prev) => [newComp, ...prev.filter((c) => c.id !== targetCompId)]);
            }
            if (onUpdateCompany) {
              onUpdateCompany(newComp);
            }
          } else {
            // Existing company found: auto-enrich phones/emails even if Contact Person is left blank
            const allPhonesToAppend = [
              ...validCompPhones.map((p) => ({ id: p.id, label: p.label || 'Main', number: p.number.trim() })),
              ...validContactPhones.map((p) => ({ id: p.id, label: p.label || 'Direct', number: p.number.trim() }))
            ];
            const allEmailsToAppend = [
              ...validCompEmails.map((e) => ({ id: e.id, label: e.label || 'Main', email: e.email.trim() })),
              ...validContactEmails.map((e) => ({ id: e.id, label: e.label || 'Direct', email: e.email.trim() }))
            ];

            const enrichedComp = await CompanyRepository.appendPhonesAndEmails(
              targetCompId!,
              allPhonesToAppend,
              allEmailsToAppend
            );
            if (enrichedComp) {
              const newLinksToAppend = validCompLinks.filter(vl => !(enrichedComp.links || []).some(el => el.url === vl.url.trim()));
              if (newLinksToAppend.length > 0) {
                enrichedComp.links = [...(enrichedComp.links || []), ...newLinksToAppend.map(l => ({ id: l.id, label: l.label || 'Website', url: l.url.trim() }))];
              }
              if (expressRelationship || expressTemperature) {
                enrichedComp.relationship = expressRelationship || enrichedComp.relationship || 'Prospect';
                enrichedComp.temperature = expressTemperature || enrichedComp.temperature || 'Cold';
              }
              if (isInvalidNumberCall && dialedPhone) {
                enrichedComp.restricted_lines = {
                  ...(enrichedComp.restricted_lines || {}),
                  [dialedPhone]: 'Invalid'
                };
              }
              await CompanyRepository.saveCompany(enrichedComp);
              targetComp = enrichedComp;

              if (setCompanies) {
                setCompanies((prev) => prev.map((c) => (c.id === targetCompId ? enrichedComp : c)));
              }
              if (onUpdateCompany) {
                onUpdateCompany(enrichedComp);
              }
            }
          }

          resolvedCompanyId = targetCompId;
          resolvedCompanyName = compName;

          // 2. Nest/Create Contact Person if provided
          if (cName || validContactPhones.length > 0 || validContactEmails.length > 0) {
            const contactFullName = cName || `${compName} Representative`;
            let targetContact: Contact | null = null;

            if (contacts && contacts.length > 0) {
              targetContact = contacts.find(
                (ct) => ct.company_id === targetCompId && (ct.full_name || '').toLowerCase() === contactFullName.toLowerCase()
              ) || null;
            }

            let targetContactId = targetContact?.id;

            if (!targetContact) {
              targetContactId = `cont_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
              const newContact: Contact = {
                id: targetContactId,
                workspace_id: activeWorkspaceId,
                company_id: targetCompId,
                full_name: contactFullName,
                designation: cRole || undefined,
                mobile: primaryContactPhone,
                email: primaryContactEmail,
                phones: validContactPhones.map((p) => ({
                  id: p.id,
                  label: p.label || 'Direct Line',
                  tag: p.label || 'Direct Line',
                  number: p.number.trim(),
                  isInvalid: isInvalidNumberCall,
                  is_invalid: isInvalidNumberCall
                })),
                emails: validContactEmails.map((e) => ({ id: e.id, label: e.label || 'Direct', email: e.email.trim() })),
                is_primary: true,
                is_dnc: isDnc || isDncOptOut,
                dnc: isDnc || isDncOptOut,
                ...(isDnc || isDncOptOut ? { dnc_reason: 'Opt-Out from Activity Log' } : {}),
                createdAt: nowIso,
                updatedAt: nowIso,
                ...(isInvalidNumberCall && primaryContactPhone ? {
                  restricted_lines: { [primaryContactPhone]: 'Invalid' }
                } : {})
              };

              await safeSetDoc('contacts', targetContactId, newContact);
              await CompanyRepository.saveContact(newContact);

              if (setContacts) {
                setContacts((prev) => [newContact, ...prev.filter((c) => c.id !== targetContactId)]);
              }
              if (onUpdateContact) {
                onUpdateContact(newContact);
              }
            } else {
              let updatedCt = { ...targetContact };
              let ctChanged = false;

              const existingCPhones = getContactPhones(targetContact);
              validContactPhones.forEach((p) => {
                if (!existingCPhones.some((ep) => isSamePhoneNumber(ep.number || ep.value, p.number))) {
                  const newPhoneObj = {
                    id: p.id,
                    label: p.label || 'Direct Line',
                    tag: p.label || 'Direct Line',
                    number: p.number.trim(),
                    isInvalid: isInvalidNumberCall,
                    is_invalid: isInvalidNumberCall
                  };
                  updatedCt.phones = [...(updatedCt.phones || []), newPhoneObj];
                  ctChanged = true;
                } else if (isInvalidNumberCall) {
                  updatedCt.phones = (updatedCt.phones || []).map((ep: any) => {
                    if (isSamePhoneNumber(ep.number || ep.value, p.number)) {
                      return { ...ep, isInvalid: true, is_invalid: true };
                    }
                    return ep;
                  });
                  ctChanged = true;
                }
              });

              if (isInvalidNumberCall && primaryContactPhone) {
                updatedCt.restricted_lines = {
                  ...(updatedCt.restricted_lines || {}),
                  [primaryContactPhone]: 'Invalid'
                };
                ctChanged = true;
              }

              if (isDnc || isDncOptOut) {
                updatedCt.is_dnc = true;
                updatedCt.dnc = true;
                updatedCt.dnc_reason = updatedCt.dnc_reason || 'Opt-Out from Activity Log';
                ctChanged = true;
              }

              if (ctChanged) {
                updatedCt.updatedAt = nowIso;
                await safeSetDoc('contacts', targetContactId, updatedCt);
                await CompanyRepository.saveContact(updatedCt);

                if (setContacts) {
                  setContacts((prev) => prev.map((c) => (c.id === targetContactId ? updatedCt : c)));
                }
                if (onUpdateContact) {
                  onUpdateContact(updatedCt);
                }
              }
            }

            resolvedContactId = targetContactId;
            resolvedContactName = contactFullName;
            resolvedContactPhone = primaryContactPhone || primaryCompPhone;
          } else {
            resolvedContactPhone = primaryCompPhone;
          }
        } else if (cName) {
          resolvedUnlinkedName = cName;
          resolvedUnlinkedInfo = primaryContactPhone || primaryContactEmail || primaryCompPhone || primaryCompEmail;
        } else {
          // Fall back to standard unlinked log if ONLY phone/email provided
          resolvedUnlinkedName = unlinkedName.trim() || undefined;
          resolvedUnlinkedInfo = primaryCompPhone || primaryCompEmail || primaryContactPhone || primaryContactEmail || unlinkedContactInfo.trim() || undefined;
        }
      }

      // Universal post-resolution auto-flagging for Invalid Number calls
      if (isInvalidNumberCall) {
        const interactionPhone = (resolvedContactPhone || selectedContactPhone || unlinkedContactInfo || '').trim();
        if (interactionPhone) {
          if (resolvedContactId) {
            const targetCt = (contacts || []).find((c) => c.id === resolvedContactId);
            if (targetCt) {
              const currentRestrictions = targetCt.restricted_lines || {};
              if (currentRestrictions[interactionPhone] !== 'Invalid') {
                const updatedCt: Contact = {
                  ...targetCt,
                  restricted_lines: {
                    ...currentRestrictions,
                    [interactionPhone]: 'Invalid'
                  },
                  updatedAt: nowIso
                };
                await safeSetDoc('contacts', resolvedContactId, updatedCt);
                await CompanyRepository.saveContact(updatedCt);
                if (setContacts) {
                  setContacts((prev) => prev.map((c) => (c.id === resolvedContactId ? updatedCt : c)));
                }
                if (onUpdateContact) {
                  onUpdateContact(updatedCt);
                }
              }
            }
          }

          if (resolvedCompanyId) {
            const targetComp = (companies || []).find((c) => c.id === resolvedCompanyId);
            if (targetComp) {
              const currentRestrictions = targetComp.restricted_lines || {};
              if (currentRestrictions[interactionPhone] !== 'Invalid') {
                const updatedComp: Company = {
                  ...targetComp,
                  restricted_lines: {
                    ...currentRestrictions,
                    [interactionPhone]: 'Invalid'
                  },
                  updatedAt: nowIso
                };
                await safeSetDoc('companies', resolvedCompanyId, updatedComp);
                await CompanyRepository.saveCompany(updatedComp);
                if (setCompanies) {
                  setCompanies((prev) => prev.map((c) => (c.id === resolvedCompanyId ? updatedComp : c)));
                }
                if (onUpdateCompany) {
                  onUpdateCompany(updatedComp);
                }
              }
            }
          }
        }
      }

      const activeLog = existingLog || logToEdit;

      let finalStatus: CallStatus = status || 'Completed';
      let completedAtIso: string | undefined = undefined;

      const isCurScheduled = finalStatus === 'Scheduled' || finalStatus === 'Scheduled / Planned' || finalStatus?.toLowerCase().includes('scheduled');
      if (!isCurScheduled && (drawerMode === 'execute' || finalStatus === 'Completed' || drawerMode !== 'edit')) {
        finalStatus = (status && status !== 'Scheduled / Planned' && status !== 'Scheduled' && !status.toLowerCase().includes('scheduled')) ? status : 'Completed';
        completedAtIso = nowIso;
      }

      const payload: Omit<CallLogEntry, 'id'> = {
        workspace_id: activeWorkspaceId,
        date: activityIsoDate,
        status: finalStatus,
        outcome: isInternalTask
          ? undefined
          : (isCompletedState ? (isAsyncChannel ? 'Message Sent / Awaiting Reply' : (outcome || '')) : ''),
        channel: channel,
        requirement_notes: notes.trim(),
        whatsapp_draft: whatsappDraft ? whatsappDraft.trim() : undefined,
        next_followup_date: followupIsoDate,
        followup_intent: followupDate ? (followupIntent.trim() || undefined) : undefined,
        email_subject: channel === 'Email' ? (emailSubject.trim() || undefined) : undefined,
        email_address: channel === 'Email' ? (selectedContactEmail.trim() || undefined) : undefined,
        location_or_link: (channel === 'Meeting' || channel === 'Site Visit') ? (locationOrLink.trim() || undefined) : undefined,
        company_id: resolvedCompanyId,
        company_name: resolvedCompanyName,
        contact_id: resolvedContactId,
        contact_name: resolvedContactName,
        contact_phone: resolvedContactPhone,
        unlinked_name: resolvedUnlinkedName,
        unlinked_contact_info: resolvedUnlinkedInfo,
        enquiry_id: linkMode === 'crm' ? (selectedEnquiryId || undefined) : undefined,
        enquiry_quote_ref: linkMode === 'crm' ? (selectedEnquiryQuoteRef || undefined) : undefined,
        logged_by: currentUserInitials || 'System',
        sales_person_id: currentSalespersonId || undefined,
        sales_person: currentUserInitials || undefined,
        handled_by_salesperson_id: currentSalespersonId || undefined,
        handled_by_team_member_name: currentUserInitials || undefined,
        interaction_type: interactionTypeMap[channel] || 'call',
        purpose: isInternalTask ? undefined : (purpose || undefined),
        created_by_uid: userUid,
        created_by_name: userName,
        last_modified_by_uid: userUid,
        last_modified_by_name: userName,
        createdAt: nowIso,
        updatedAt: nowIso,
        ...(completedAtIso ? { completedAt: completedAtIso } : {}),
        ...(isDncOptOut ? { dnc: true, opt_out: true, is_dnc: true } : { dnc: false, opt_out: false, is_dnc: false }) as any
      };

      if (drawerMode === 'execute' && activeLog && activeLog.id) {
        // Track 1: Live Execution Mode
        // 1. Update the existingLog with the active status, outcome, purpose, and notes using snapped activityDate
        const updatedExistingLog: CallLogEntry = {
          ...activeLog,
          ...payload,
          id: activeLog.id,
          date: activityIsoDate,
          status: finalStatus as any,
          outcome: isInternalTask ? undefined : (isAsyncChannel ? 'Message Sent / Awaiting Reply' : (outcome || activeLog.outcome || 'Completed')),
          purpose: isInternalTask ? undefined : (purpose || (activeLog.purpose === 'Discovery / Validation' ? 'Discovery / Qualification' : activeLog.purpose) || 'Discovery / Qualification'),
          requirement_notes: notes.trim(),
          completed_at: nowIso,
          completedAt: nowIso,
          executed_at: nowIso,
          updatedAt: nowIso,
          last_modified_by_uid: userUid,
          last_modified_by_name: userName
        };

        if (isInternalTask) {
          delete (updatedExistingLog as any).outcome;
          delete (updatedExistingLog as any).purpose;
        }

        await safeSetDoc('activity_logs', activeLog.id, updatedExistingLog);
        await safeSetDoc('call_logs', activeLog.id, updatedExistingLog);
        await CallLogRepository.save(updatedExistingLog);

        let spawnedFollowUpLog: CallLogEntry | null = null;
        // The Spawner: IF nextFollowUpDate has a value, explicitly construct a SECOND brand-new activity log object
        if (followupIsoDate && followupIsoDate.trim() !== '') {
          const newFollowUpId = `act_${Date.now()}_fup_${Math.random().toString(36).substring(2, 7)}`;
          spawnedFollowUpLog = {
            id: newFollowUpId,
            workspace_id: activeWorkspaceId || payload.workspace_id || 'ws_default',
            date: followupIsoDate,
            status: 'Scheduled / Planned',
            outcome: isInternalTask ? undefined : 'Follow-Up Scheduled',
            channel: channel,
            interaction_type: interactionTypeMap[channel] || 'call',
            purpose: isInternalTask ? undefined : (purpose || 'Follow-up / Check-in'),
            requirement_notes: followupIntent.trim() || '',
            followup_intent: followupIntent.trim() || undefined,
            company_id: resolvedCompanyId || activeLog.company_id,
            company_name: resolvedCompanyName || activeLog.company_name,
            contact_id: resolvedContactId || activeLog.contact_id,
            contact_name: resolvedContactName || activeLog.contact_name,
            contact_phone: resolvedContactPhone || activeLog.contact_phone,
            unlinked_name: resolvedUnlinkedName || activeLog.unlinked_name,
            unlinked_contact_info: resolvedUnlinkedInfo || activeLog.unlinked_contact_info,
            enquiry_id: linkMode === 'crm' ? (selectedEnquiryId || activeLog.enquiry_id) : undefined,
            enquiry_quote_ref: linkMode === 'crm' ? (selectedEnquiryQuoteRef || activeLog.enquiry_quote_ref) : undefined,
            logged_by: currentUserInitials || 'System',
            sales_person_id: currentSalespersonId || undefined,
            sales_person: currentUserInitials || undefined,
            handled_by_salesperson_id: currentSalespersonId || undefined,
            handled_by_team_member_name: currentUserInitials || undefined,
            created_by_uid: userUid,
            created_by_name: userName,
            last_modified_by_uid: userUid,
            last_modified_by_name: userName,
            createdAt: nowIso,
            updatedAt: nowIso
          };

          if (isInternalTask) {
            delete (spawnedFollowUpLog as any).outcome;
            delete (spawnedFollowUpLog as any).purpose;
          }

          await safeSetDoc('activity_logs', newFollowUpId, spawnedFollowUpLog);
          await safeSetDoc('call_logs', newFollowUpId, spawnedFollowUpLog);
          await CallLogRepository.save(spawnedFollowUpLog);
        }

        if (setCallLogs) {
          setCallLogs((prev) => {
            const updatedList = prev.map((log) => (log.id === activeLog.id ? updatedExistingLog : log));
            if (spawnedFollowUpLog) {
              return [spawnedFollowUpLog, ...updatedList.filter((l) => l.id !== spawnedFollowUpLog!.id)];
            }
            return updatedList;
          });
        }
        if (onSave) {
          onSave(updatedExistingLog);
        }
        if (onUpdate) {
          onUpdate(updatedExistingLog);
        }
      } else if (drawerMode === 'edit' && activeLog && activeLog.id) {
        // Track 2: Edit Mode
        // Standard update on existingLog applying currently selected fields (including nextFollowUpDate). No new log spawned.
        const updatedEntry: CallLogEntry = {
          ...activeLog,
          ...payload,
          id: activeLog.id,
          updatedAt: nowIso,
          last_modified_by_uid: userUid,
          last_modified_by_name: userName
        };

        if (isInternalTask) {
          delete (updatedEntry as any).outcome;
          delete (updatedEntry as any).purpose;
        }

        await safeSetDoc('activity_logs', activeLog.id, updatedEntry);
        await safeSetDoc('call_logs', activeLog.id, updatedEntry);
        await CallLogRepository.save(updatedEntry);

        if (setCallLogs) {
          setCallLogs((prev) => prev.map((log) => (log.id === activeLog.id ? updatedEntry : log)));
        }
        if (onSave) {
          onSave(updatedEntry);
        }
        if (onUpdate) {
          onUpdate(updatedEntry);
        }
      } else {
        // Track 3: Create Mode
        // Standard creation of a single new log
        const newId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newEntry: CallLogEntry = {
          ...payload,
          id: newId
        };

        if (isInternalTask) {
          delete (newEntry as any).outcome;
          delete (newEntry as any).purpose;
        }

        await safeSetDoc('activity_logs', newId, newEntry);
        await safeSetDoc('call_logs', newId, newEntry);
        await CallLogRepository.save(newEntry);

        let spawnedFollowUpLog: CallLogEntry | null = null;
        if (followupIsoDate && followupIsoDate.trim() !== '') {
          const scheduledLogId = `act_${Date.now()}_fup_${Math.random().toString(36).substring(2, 7)}`;
          spawnedFollowUpLog = {
            ...payload,
            id: scheduledLogId,
            workspace_id: activeWorkspaceId || payload.workspace_id || 'ws_default',
            company_id: resolvedCompanyId || payload.company_id,
            company_name: resolvedCompanyName || payload.company_name,
            date: followupIsoDate,
            status: 'Scheduled / Planned' as CallStatus,
            outcome: isInternalTask ? undefined : 'Follow-Up Scheduled',
            purpose: isInternalTask ? undefined : payload.purpose,
            requirement_notes: followupIntent.trim() || '',
            followup_intent: followupIntent.trim() || undefined,
            next_followup_date: undefined,
            createdAt: nowIso,
            updatedAt: nowIso
          };

          if (isInternalTask) {
            delete (spawnedFollowUpLog as any).outcome;
            delete (spawnedFollowUpLog as any).purpose;
          }

          await safeSetDoc('activity_logs', scheduledLogId, spawnedFollowUpLog);
          await safeSetDoc('call_logs', scheduledLogId, spawnedFollowUpLog);
          await CallLogRepository.save(spawnedFollowUpLog);
        }

        if (setCallLogs) {
          setCallLogs((prev) => {
            const list = [newEntry, ...prev.filter((log) => log.id !== newId)];
            if (spawnedFollowUpLog) {
              return [spawnedFollowUpLog, ...list.filter((l) => l.id !== spawnedFollowUpLog!.id)];
            }
            return list;
          });
        }
        if (onSave) {
          onSave(newEntry);
        }
        if (onUpdate) {
          onUpdate(newEntry);
        }
      }

      // Auto-DNC Suppression Trigger
      if (isDncOptOut) {
        if (resolvedContactId) {
          await safeUpdateDoc('contacts', resolvedContactId, {
            is_dnc: true,
            dnc_reason: 'Opt-Out from Activity Log',
            last_modified_by_uid: userUid,
            last_modified_by_name: userName,
            updatedAt: nowIso
          });
          if (setContacts) {
            setContacts((prev) =>
              prev.map((c) =>
                c.id === resolvedContactId
                  ? { ...c, is_dnc: true, dnc_reason: 'Opt-Out from Activity Log', updatedAt: nowIso }
                  : c
              )
            );
          }
        }
        if (resolvedCompanyId) {
          await safeUpdateDoc('companies', resolvedCompanyId, {
            is_dnc: true,
            last_modified_by_uid: userUid,
            last_modified_by_name: userName,
            updatedAt: nowIso
          });
          if (setCompanies) {
            setCompanies((prev) =>
              prev.map((c) => (c.id === resolvedCompanyId ? { ...c, is_dnc: true, updatedAt: nowIso } : c))
            );
          }
        }
      }

      onSaveSuccess();
      handleReset();
      onClose();
    } catch (error) {
      console.error('Error logging activity:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] overflow-hidden bg-slate-950/70 backdrop-blur-xs flex justify-end items-end sm:items-start">
        {/* Backdrop click to close */}
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-2xl bg-slate-900 sm:border-l border-t sm:border-t-0 border-slate-800 shadow-2xl flex flex-col h-[90vh] sm:h-full max-h-[90vh] sm:max-h-full rounded-t-2xl sm:rounded-none z-10 text-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400">
                <PhoneCall className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-100">
                  {existingLog || logToEdit ? 'Edit Activity Log' : 'Activity Logger'}
                </h2>
                <p className="text-xs text-slate-400">
                  Record calls, emails, or visits with instant CRM auto-registration
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {drawerMode === 'execute' && (
              <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center space-x-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-red-400 text-xs font-bold tracking-wider uppercase">Live Execution Mode</span>
              </div>
            )}

            {/* Validation Error Alert */}
            {validationError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 flex items-center gap-2.5 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Target Link Mode Toggle */}
            {!companyId && (
              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkMode('crm');
                      setValidationError(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      linkMode === 'crm'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Existing CRM Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkMode('unsaved');
                      setValidationError(null);
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      linkMode === 'unsaved'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Express Lead Entry (Auto-CRM)</span>
                  </button>
                </div>
              </div>
            )}

            {/* Target Company / Contact Context (CRM Mode) */}
            {linkMode === 'crm' || companyId ? (
              <>
                {companyId ? (
                  <div className="rounded-xl bg-slate-800/80 p-3.5 border border-slate-700/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      <span>Target Account</span>
                      <span className="text-[10px] text-blue-400 font-mono">Fixed Context</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 font-bold text-sm text-slate-100">
                        <Building2 className="h-4 w-4 text-blue-400 shrink-0" />
                        <span>{selectedCompanyName || companyName || 'Company Account'}</span>
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(selectedCompanyName || companyName || '')}`} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 bg-blue-900/50 hover:bg-blue-800 text-blue-300 border border-blue-700/50 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer" title="Search Company on Google"><Search className="w-3 h-3" /><span>Google Search</span></a>
                      </div>
                      {selectedEnquiryQuoteRef && (
                        <div className="flex items-center gap-1.5 text-xs text-purple-300 bg-purple-950/60 px-2.5 py-1 rounded-md border border-purple-800/60 font-mono">
                          <FileText className="h-3.5 w-3.5 text-purple-400" />
                          <span>Quote Ref: <strong>{selectedEnquiryQuoteRef}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Context Link & Company Temperature Control */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedCompanyId) {
                            if (onOpen360) onOpen360(selectedCompanyId);
                            else if (onInspectCompany) onInspectCompany(selectedCompanyId);
                            else if (onOpenCompanyModal) onOpenCompanyModal(selectedCompanyId);
                            onClose();
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:underline transition cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>[View Previous Logs]</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Temp:</span>
                        <select
                          value={selectedCompanyObj?.is_dnc ? 'DNC' : (selectedCompanyObj?.temperature || 'Cold')}
                          onChange={(e) => handleUpdateCompanyTemperature(e.target.value as any)}
                          className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:border-blue-500 focus:outline-hidden cursor-pointer"
                        >
                          <option value="Cold">Cold ❄️</option>
                          <option value="Warm">Warm 🌤️</option>
                          <option value="Hot">Hot 🔥</option>
                          <option value="DNC">DNC 🚫</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 relative">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Target Company <span className="text-rose-400">*</span>
                    </label>

                    {selectedCompanyId ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-blue-500/50 text-xs">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-blue-400 shrink-0" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-100">{selectedCompanyName}</span>
                                <a href={`https://www.google.com/search?q=${encodeURIComponent(selectedCompanyName || '')}`} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 bg-blue-900/50 hover:bg-blue-800 text-blue-300 border border-blue-700/50 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer" title="Search Company on Google"><Search className="w-3 h-3" /><span>Google Search</span></a>
                              </div>
                              <p className="text-[10px] text-slate-400 font-mono">Selected Account</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {selectedCompanyId && (
                              <button
                                type="button"
                                onClick={() => openEditCompany(selectedCompanyId)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                                title="Edit Company Profile & Contacts"
                              >
                                <Edit2 className="w-3 h-3 text-indigo-400" />
                                <span>Edit</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCompanyId('');
                                setSelectedCompanyName('');
                                setSelectedContactId('');
                                setSelectedContactName('');
                                setSelectedContactPhone('');
                                setSelectedEnquiryId('');
                                setSelectedEnquiryQuoteRef('');
                                setIsComboboxOpen(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                            >
                              Change
                            </button>
                          </div>
                        </div>

                        {/* Context Link & Company Temperature Control */}
                        <div className="flex items-center justify-between flex-wrap gap-2 px-1">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (selectedCompanyId) {
                                  if (onOpen360) onOpen360(selectedCompanyId);
                                  else if (onInspectCompany) onInspectCompany(selectedCompanyId);
                                  else if (onOpenCompanyModal) onOpenCompanyModal(selectedCompanyId);
                                  onClose();
                                }
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:underline transition cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>[View Previous Logs]</span>
                            </button>
                            {selectedCompanyId && (
                              <button
                                type="button"
                                onClick={() => openEditCompany(selectedCompanyId)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline transition cursor-pointer"
                                title="Edit Company Profile in Universal Modal"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>[Edit Profile]</span>
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Temp:</span>
                            <select
                              value={selectedCompanyObj?.is_dnc ? 'DNC' : (selectedCompanyObj?.temperature || 'Cold')}
                              onChange={(e) => handleUpdateCompanyTemperature(e.target.value as any)}
                              className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-slate-900 border border-slate-700 text-slate-200 focus:border-blue-500 focus:outline-hidden cursor-pointer"
                            >
                              <option value="Cold">Cold ❄️</option>
                              <option value="Warm">Warm 🌤️</option>
                              <option value="Hot">Hot 🔥</option>
                              <option value="DNC">DNC 🚫</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="relative flex items-center">
                          <Search className="absolute left-3 h-4 w-4 text-slate-500 pointer-events-none" />
                          <input
                            type="text"
                            value={companySearchQuery}
                            onChange={(e) => {
                              setCompanySearchQuery(e.target.value);
                              setIsComboboxOpen(true);
                              setValidationError(null);
                            }}
                            onFocus={() => setIsComboboxOpen(true)}
                            placeholder="Search company by name or alias..."
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        </div>

                        {isComboboxOpen && (
                          <div className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-xl bg-slate-900 border border-slate-700 shadow-xl p-1 space-y-0.5">
                            {filteredCompanies.length > 0 ? (
                              filteredCompanies.map((c, idx) => (
                                <button
                                  key={c.id ? `${c.id}_${idx}` : `comp_${idx}`}
                                  type="button"
                                  onClick={() => handleSelectCompany(c)}
                                  className="w-full text-left p-2 rounded-lg hover:bg-blue-600/20 hover:border-blue-500/30 border border-transparent transition-colors flex items-center justify-between cursor-pointer"
                                >
                                  <div className="flex items-center gap-2">
                                    <Building2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                    <div>
                                      <span className="text-xs font-semibold text-slate-100 block">
                                        {c.display_name || c.canonical_name}
                                      </span>
                                      {(c.city || c.country) && (
                                        <span className="text-[10px] text-slate-400 block font-mono">
                                          {[c.city, c.country].filter(Boolean).join(', ')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <Check className="h-3.5 w-3.5 text-slate-600" />
                                </button>
                              ))
                            ) : (
                              <div className="p-3 text-center text-xs text-slate-500 italic">
                                No matching companies found
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Target Selection Toggle (Contact Person vs. Company Mainline) */}
                {selectedCompanyId && (
                  <div className="flex items-center gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 my-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCrmTargetType('contact');
                        setIsAddingNewCompanyLine(false);
                        setSelectedContactPhone('');
                        setSelectedContactEmail('');
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        crmTargetType === 'contact'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Contact Person</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCrmTargetType('company_mainline');
                        setIsAddingNewContact(false);
                        setIsAddingNewContactPhone(false);
                        setSelectedContactId('');
                        setSelectedContactName('');
                        setSelectedContactEmail('');
                        const selComp = companies.find((c) => c.id === selectedCompanyId);
                        if (selComp) {
                          const compPhones = getCompanyPhones(selComp);
                          if (compPhones.length > 0) {
                            setSelectedContactPhone(compPhones[0].number);
                            setMainlineTag(compPhones[0].label || 'Front Desk');
                          } else if (selComp.general_phone) {
                            setSelectedContactPhone(selComp.general_phone);
                            setMainlineTag('Front Desk');
                          }
                        }
                      }}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                        crmTargetType === 'company_mainline'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Company Mainline</span>
                    </button>
                  </div>
                )}

                {/* Contact & Phone Dropdowns */}
                {selectedCompanyId && (
                  <div className="space-y-3 pt-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {crmTargetType === 'contact' ? (
                        <div>
                          {isAddingNewContact ? (
                            <div className="space-y-2.5 p-3 rounded-xl bg-slate-900/80 border border-blue-500/40">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
                                  <UserPlus className="w-3.5 h-3.5 text-blue-400" />
                                  <span>New Contact Person</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsAddingNewContact(false);
                                    setSelectedContactId('');
                                    setSelectedContactName('');
                                    setSelectedContactPhone('');
                                  }}
                                  className="text-[10px] font-semibold text-slate-400 hover:text-rose-300 cursor-pointer"
                                >
                                  &larr; Select Existing
                                </button>
                              </div>

                              <div className="flex flex-col gap-2.5 pt-1">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                    Full Name <span className="text-blue-400">*</span>
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedContactName}
                                    onChange={(e) => {
                                      setSelectedContactName(e.target.value);
                                      setSelectedContactId('');
                                    }}
                                    placeholder="Enter full name..."
                                    className="w-full rounded-lg bg-slate-950 border border-blue-500/50 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                    autoFocus
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                    Designation / Role
                                  </label>
                                  <input
                                    type="text"
                                    value={newContactDesignation}
                                    onChange={(e) => setNewContactDesignation(e.target.value)}
                                    placeholder="e.g. Procurement Manager, General Manager..."
                                    className="w-full rounded-lg bg-slate-950 border border-blue-500/50 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                    Phone Number
                                  </label>
                                  <input
                                    type="text"
                                    value={selectedContactPhone}
                                    onChange={(e) => setSelectedContactPhone(e.target.value)}
                                    placeholder="+971 50 123 4567"
                                    className="w-full rounded-lg bg-slate-950 border border-blue-500/50 px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[11px] font-medium text-slate-300 mb-1">
                                    Contact Tag / Label
                                  </label>
                                  <select
                                    value={newPhoneTag}
                                    onChange={(e) => {
                                      setNewPhoneTag(e.target.value);
                                      setNewContactPhoneTag(e.target.value);
                                    }}
                                    className="w-full rounded-lg bg-slate-950 border border-blue-500/50 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden cursor-pointer"
                                  >
                                    <option value="Mobile">Mobile</option>
                                    <option value="Work">Work</option>
                                    <option value="Direct Line">Direct Line</option>
                                    <option value="Home">Home</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-xs font-medium text-slate-300">
                                  Contact Person
                                </label>
                                <div className="flex items-center gap-2">
                                  {selectedContactId && (
                                    <button
                                      type="button"
                                      onClick={() => openEditContact(selectedCompanyId, selectedContactId)}
                                      className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 cursor-pointer"
                                      title="Edit Contact Person Details"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                      <span>[Edit Contact]</span>
                                    </button>
                                  )}
                                  {selectedCompanyId && (
                                    <button
                                      type="button"
                                      onClick={() => openEditContact(selectedCompanyId)}
                                      className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer"
                                      title="Add New Contact Person via Modal"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>[Add Contact]</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                              <select
                                value={selectedContactId || (selectedContactName ? 'CUSTOM' : '')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'CREATE_NEW') {
                                    setIsAddingNewContact(true);
                                    setSelectedContactId('');
                                    setSelectedContactName('');
                                    setSelectedContactPhone('');
                                    setSelectedContactEmail('');
                                    setIsAddingNewContactPhone(true);
                                  } else if (val && val !== 'CUSTOM') {
                                    setIsAddingNewContact(false);
                                    handleSelectContact(val);
                                  } else if (!val) {
                                    setIsAddingNewContact(false);
                                    setSelectedContactId('');
                                    setSelectedContactName('');
                                    setSelectedContactPhone('');
                                    setSelectedContactEmail('');
                                  }
                                }}
                                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer"
                              >
                                <option value="">-- Select Contact Person --</option>
                                {availableCompanyContacts.map((c) => {
                                  const selComp = companies.find((comp) => comp.id === selectedCompanyId);
                                  const rawMobile = (c.mobile || '').trim();
                                  let cleanMobile = rawMobile.replace(/^(mobile|direct line|work|phone|tel)[:\s-]+/i, '').trim();
                                  if (cleanMobile) {
                                    const parts = cleanMobile.split(/\s*[\(\)\/,-]\s*/).map((s) => s.trim()).filter(Boolean);
                                    if (parts.length > 1 && parts.every((p) => p === parts[0])) {
                                      cleanMobile = parts[0];
                                    }
                                  }
                                  const mobTrim = cleanMobile || rawMobile;
                                  const res = (mobTrim && (c.restricted_lines?.[c.mobile] || c.restricted_lines?.[mobTrim] || selComp?.restricted_lines?.[c.mobile] || selComp?.restricted_lines?.[mobTrim])) || (c.is_dnc ? 'DNC' : undefined);
                                  const badge = res === 'DNC' ? ' 🚫 [DNC]' : res === 'Invalid' ? ' ⚠️ [Invalid]' : res ? ` ⚠️ [${res}]` : '';
                                  const desigPart = c.designation ? ` (${c.designation.trim()})` : '';
                                  return (
                                    <option key={c.id} value={c.id}>
                                      {c.full_name}{desigPart}{badge}
                                    </option>
                                  );
                                })}
                                {selectedContactName && !availableCompanyContacts.some((c) => c.id === selectedContactId) && (
                                  <option value="CUSTOM">{selectedContactName} (Custom/Unsaved)</option>
                                )}
                                <option value="CREATE_NEW" className="font-bold text-blue-400 bg-slate-900">+ Create New Contact Person</option>
                              </select>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="col-span-full">
                          {isAddingNewCompanyLine ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-semibold text-amber-300">New Company Line Details</label>
                                <button
                                  type="button"
                                  onClick={() => setIsAddingNewCompanyLine(false)}
                                  className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                                >
                                  &larr; Select Saved Line
                                </button>
                              </div>
                              <div className="flex flex-col gap-2.5">
                                <div>
                                  <label className="block text-[11px] font-medium text-amber-200/80 mb-1">
                                    Line Phone Number <span className="text-amber-400">*</span>
                                  </label>
                                  <div className="flex items-center gap-1.5 w-full">
                                    <input
                                      type="text"
                                      value={selectedContactPhone}
                                      onChange={(e) => setSelectedContactPhone(e.target.value)}
                                      placeholder="Enter line phone number (e.g. +971 4 123 4567)..."
                                      className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-amber-500/50 px-3 py-2 text-xs text-amber-100 font-mono placeholder-slate-500 focus:border-amber-400 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                                      autoFocus
                                    />
                                    {renderPhoneActionButton(selectedContactPhone)}
                                  </div>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-amber-200/80 mb-1">
                                    Line Tag / Label
                                  </label>
                                  <input
                                    type="text"
                                    value={mainlineTag}
                                    onChange={(e) => setMainlineTag(e.target.value)}
                                    placeholder="Line tag (e.g. Front Desk, Switchboard, Reception)..."
                                    className="w-full rounded-lg bg-slate-950 border border-amber-500/50 px-3 py-2 text-xs text-amber-100 placeholder-slate-500 focus:border-amber-400 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-medium text-amber-300 mb-1.5">
                                Company Line
                              </label>
                              <div className="flex items-center gap-1.5 w-full">
                                <select
                                  value={selectedContactPhone}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'ADD_NEW_LINE') {
                                      setIsAddingNewCompanyLine(true);
                                      setSelectedContactPhone('');
                                      setMainlineTag('Front Desk');
                                    } else {
                                      setIsAddingNewCompanyLine(false);
                                      setSelectedContactPhone(val);
                                      const matched = companyMainlines.find((m) => m.number === val);
                                      if (matched) {
                                        setMainlineTag(matched.label || 'Front Desk');
                                      }
                                    }
                                  }}
                                  className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-amber-100 focus:border-amber-400 focus:outline-hidden focus:ring-1 focus:ring-amber-400 font-mono cursor-pointer"
                                >
                                  <option value="">-- Select Company Line --</option>
                                  {companyMainlines.map((m, idx) => {
                                    const selComp = companies.find((c) => c.id === selectedCompanyId);
                                    const numTrim = (m.number || '').trim();
                                    const res = selComp?.restricted_lines?.[m.number] || selComp?.restricted_lines?.[numTrim] || (selComp?.is_dnc ? 'DNC' : undefined);
                                    const badge = res === 'DNC' ? ' 🚫 [DNC]' : res === 'Invalid' ? ' ⚠️ [Invalid]' : res ? ` ⚠️ [${res}]` : '';
                                    return (
                                      <option key={`m_${idx}`} value={m.number}>
                                        {m.number} — {m.label || 'Front Desk'}{badge}
                                      </option>
                                    );
                                  })}
                                  {selectedContactPhone && !companyMainlines.some((m) => m.number === selectedContactPhone) && (
                                    <option value={selectedContactPhone}>
                                      {selectedContactPhone} ({mainlineTag || 'Main'}){(() => {
                                        const selComp = companies.find((c) => c.id === selectedCompanyId);
                                        const pTrim = selectedContactPhone.trim();
                                        const res = selComp?.restricted_lines?.[selectedContactPhone] || selComp?.restricted_lines?.[pTrim];
                                        return res === 'DNC' ? ' 🚫 [DNC]' : res === 'Invalid' ? ' ⚠️ [Invalid]' : res ? ` ⚠️ [${res}]` : '';
                                      })()}
                                    </option>
                                  )}
                                  <option value="ADD_NEW_LINE" className="font-bold text-amber-400 bg-slate-900">+ Add New Company Line</option>
                                </select>
                                {renderPhoneActionButton(selectedContactPhone)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Phone Detail Field for Contact Person Mode */}
                      {crmTargetType === 'contact' && isPhoneOrMessageChannel(channel) && (
                        <div>
                          {isAddingNewContactPhone || isAddingNewContact ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-semibold text-slate-300">New Phone Number / Contact Detail</label>
                                {!isAddingNewContact && (
                                  <button
                                    type="button"
                                    onClick={() => setIsAddingNewContactPhone(false)}
                                    className="text-[10px] text-blue-400 hover:underline cursor-pointer"
                                  >
                                    &larr; Select Saved Number
                                  </button>
                                )}
                              </div>
                              <div className="flex flex-col gap-2">
                                <label className="block text-[11px] font-medium text-slate-300 mb-0.5">
                                  Phone Number
                                </label>
                                <div className="flex items-center gap-1.5 w-full">
                                  <input
                                    type="text"
                                    value={selectedContactPhone}
                                    onChange={(e) => setSelectedContactPhone(e.target.value)}
                                    placeholder="Enter phone number (e.g. +971 50 123 4567)..."
                                    className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-blue-500/50 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                                    autoFocus={isAddingNewContactPhone}
                                  />
                                  <select
                                    value={newPhoneTag}
                                    onChange={(e) => setNewPhoneTag(e.target.value)}
                                    className="shrink-0 rounded-lg bg-slate-950 border border-blue-500/50 px-2.5 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium cursor-pointer"
                                  >
                                    <option value="Mobile">Mobile</option>
                                    <option value="Work">Work</option>
                                    <option value="Direct Line">Direct Line</option>
                                    <option value="Home">Home</option>
                                    <option value="Other">Other</option>
                                  </select>
                                  {renderPhoneActionButton(selectedContactPhone)}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                                Contact Detail / Phone
                              </label>
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={selectedContactPhone}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === 'ADD_NEW_DETAIL') {
                                      setIsAddingNewContactPhone(true);
                                      setSelectedContactPhone('');
                                    } else {
                                      setIsAddingNewContactPhone(false);
                                      setSelectedContactPhone(val);
                                    }
                                  }}
                                  className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono cursor-pointer"
                                >
                                  <option value="">-- Select Phone Number --</option>
                                  {selectedContactSavedNumbers.map((p, idx) => {
                                    const selCt = contacts.find((c) => c.id === selectedContactId);
                                    const selComp = companies.find((c) => c.id === selectedCompanyId);
                                    const numTrim = (p.number || '').trim();
                                    const res = selCt?.restricted_lines?.[p.number] || selCt?.restricted_lines?.[numTrim] || selComp?.restricted_lines?.[p.number] || selComp?.restricted_lines?.[numTrim] || (selCt?.is_dnc ? 'DNC' : undefined);
                                    const badge = res === 'DNC' ? ' 🚫 [DNC]' : res === 'Invalid' ? ' ⚠️ [Invalid]' : res ? ` ⚠️ [${res}]` : '';
                                    return (
                                      <option key={`p_${idx}`} value={p.number}>
                                        {p.number} — {p.label}{badge}
                                      </option>
                                    );
                                  })}
                                  {selectedContactPhone && !selectedContactSavedNumbers.some((p) => p.number === selectedContactPhone) && (
                                    <option value={selectedContactPhone}>
                                      {selectedContactPhone} (Current){(() => {
                                        const selCt = contacts.find((c) => c.id === selectedContactId);
                                        const selComp = companies.find((c) => c.id === selectedCompanyId);
                                        const pTrim = selectedContactPhone.trim();
                                        const res = selCt?.restricted_lines?.[selectedContactPhone] || selCt?.restricted_lines?.[pTrim] || selComp?.restricted_lines?.[selectedContactPhone] || selComp?.restricted_lines?.[pTrim];
                                        return res === 'DNC' ? ' 🚫 [DNC]' : res === 'Invalid' ? ' ⚠️ [Invalid]' : res ? ` ⚠️ [${res}]` : '';
                                      })()}
                                    </option>
                                  )}
                                  <option value="ADD_NEW_DETAIL" className="font-bold text-blue-400 bg-slate-900">+ Add New Contact Detail</option>
                                </select>
                                {renderPhoneActionButton(selectedContactPhone)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {channel === 'Email' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 col-span-full">
                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1.5">
                              Email Address
                            </label>
                            <input
                              type="email"
                              list="crm-email-suggestions"
                              value={selectedContactEmail}
                              onChange={(e) => setSelectedContactEmail(e.target.value)}
                              placeholder="Type or select Email..."
                              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-mono"
                            />
                            <datalist id="crm-email-suggestions">
                              {(() => {
                                const selComp = companies.find((c) => c.id === selectedCompanyId);
                                const emails = selComp ? getCompanyEmails(selComp) : [];
                                return emails.map((e, idx) => (
                                  <option key={`e_${idx}`} value={e.email}>
                                    {e.email} {e.label ? `(${e.label})` : ''}
                                  </option>
                                ));
                              })()}
                            </datalist>
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1.5">
                              Email Subject
                            </label>
                            <input
                              type="text"
                              value={emailSubject}
                              onChange={(e) => setEmailSubject(e.target.value)}
                              placeholder="e.g. Revised Quotation for Ref #1234..."
                              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}

                      {(channel === 'Meeting' || channel === 'Site Visit') && (
                        <div className="col-span-full">
                          <label className="block text-xs font-medium text-slate-300 mb-1.5">
                            Location / Meeting Link
                          </label>
                          <input
                            type="text"
                            value={locationOrLink}
                            onChange={(e) => setLocationOrLink(e.target.value)}
                            placeholder="e.g. Client HQ / Google Meet link..."
                            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      )}
                  </div>

                  {/* Inline New Contact Creation banner (without duplicate designation input) */}
                  {crmTargetType === 'contact' && selectedContactName.trim() && !availableCompanyContacts.some((c) => (c.full_name || '').trim().toLowerCase() === selectedContactName.trim().toLowerCase()) && !isAddingNewContact && (
                    <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs text-blue-200 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                          <span className="font-bold text-white">New Contact Detected:</span>{" "}
                          <span className="font-semibold text-blue-300">{selectedContactName.trim()}</span> will be created and assigned to company.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}

                {/* Linked Enquiry / Quote Reference Selector */}
                {selectedCompanyId && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                      <span>Linked Proposal / Enquiry</span>
                      {selectedEnquiryQuoteRef && (
                        <span className="text-[10px] text-blue-400 font-mono">
                          Ref: {selectedEnquiryQuoteRef}
                        </span>
                      )}
                    </label>
                    <select
                      value={selectedEnquiryId}
                      onChange={(e) => handleSelectEnquiry(e.target.value)}
                      disabled={availableCompanyEnquiries.length === 0}
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium"
                    >
                      {availableCompanyEnquiries.length > 0 ? (
                        <>
                          <option value="">-- Select Linked Proposal / Enquiry --</option>
                          {availableCompanyEnquiries.map((e, idx) => (
                            <option key={e.id ? `${e.id}_${idx}` : `enq_${idx}`} value={e.id}>
                              {e.quote_ref_no || `Enquiry #${e.sn}`} ({e.status}) {e.value_aed ? `- AED ${e.value_aed.toLocaleString()}` : ''}
                            </option>
                          ))}
                        </>
                      ) : (
                        <option value="" disabled>
                          No active enquiries found
                        </option>
                      )}
                    </select>
                  </div>
                )}
              </>
            ) : (
              /* Express Dual-Level Lead Form Inputs */
              <div className="space-y-3.5">
                {/* Data List Suggestions for Phone and Email Custom Tags */}
                <datalist id="express-phone-tags">
                  <option value="Main" />
                  <option value="Direct Line" />
                  <option value="Mobile" />
                  <option value="Reception" />
                  <option value="Engineering Dept" />
                  <option value="Sales Desk" />
                  <option value="HQ Switchboard" />
                  <option value="After Hours" />
                  <option value="Work" />
                </datalist>

                <datalist id="express-email-tags">
                  <option value="Main" />
                  <option value="Direct" />
                  <option value="Sales" />
                  <option value="Inquiries" />
                  <option value="Support" />
                  <option value="Finance" />
                  <option value="Personal" />
                </datalist>

                {/* SECTION 1: COMPANY INFORMATION */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80">
                    <Building2 className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      1. Company Information
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-300">Company Name <span className="text-amber-400">*</span></label>
                      {expressCompanyName.trim() && (
                        <a href={`https://www.google.com/search?q=${encodeURIComponent(expressCompanyName.trim())}`} target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 bg-amber-900/50 hover:bg-amber-800 text-amber-300 border border-amber-700/50 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer" title="Search Company on Google"><Search className="w-3 h-3" /><span>Google Search</span></a>
                      )}
                    </div>
                    <input
                      type="text"
                      value={expressCompanyName}
                      onChange={(e) => {
                        setExpressCompanyName(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="e.g. Acme Industrial Solutions FZE"
                      className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                    />
                    {expressCompanyDup && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-950/70 border border-amber-600/50 flex items-center gap-2 text-xs text-amber-300">
                        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                        <span>⚠️ Existing Company Detected: <strong>{expressCompanyDup.canonical_name || expressCompanyDup.display_name}</strong> - Log details will append to this record</span>
                      </div>
                    )}
                  </div>

                  {/* Legal Suffix, City, Country Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Legal Suffix
                      </label>
                      <select
                        value={expressLegalSuffix}
                        onChange={(e) => setExpressLegalSuffix(e.target.value)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
                      >
                        <option value="None / To Be Added Later">None / To Be Added Later</option>
                        <option value="LLC">LLC</option>
                        <option value="FZE">FZE</option>
                        <option value="FZC">FZC</option>
                        <option value="Inc">Inc</option>
                        <option value="Ltd">Ltd</option>
                        <option value="PJSC">PJSC</option>
                        <option value="WLL">WLL</option>
                        <option value="Branch">Branch</option>
                        <option value="Group">Group</option>
                        <option value="None / To Be Added Later">None / To Be Added Later</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={expressCity}
                        onChange={(e) => setExpressCity(e.target.value)}
                        placeholder="e.g. Dubai"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Country
                      </label>
                      <input
                        type="text"
                        value={expressCountry}
                        onChange={(e) => setExpressCountry(e.target.value)}
                        placeholder="e.g. United Arab Emirates"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Two-Tier Industry Taxonomy Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
                        <span>Macro Parent Category</span>
                        <span className="text-[10px] text-slate-500 font-normal">Tier 1</span>
                      </label>
                      <select
                        value={expressIndustryParent}
                        onChange={(e) => setExpressIndustryParent(e.target.value)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none cursor-pointer"
                      >
                        <option value="">Select Macro Parent...</option>
                        {PARENT_INDUSTRIES.map((pi) => (
                          <option key={pi.id} value={pi.id}>
                            {pi.icon} {pi.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
                        <span>Raw Business Type</span>
                        <span className="text-[10px] text-slate-500 font-normal">GBP Sub-Type</span>
                      </label>
                      <input
                        type="text"
                        list="express-raw-subtypes-list"
                        value={expressIndustryType}
                        onChange={(e) => setExpressIndustryType(e.target.value)}
                        placeholder="e.g. Restaurant, Pool contractor"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                      />
                      <datalist id="express-raw-subtypes-list">
                        {expressDistinctSubtypes.map((st) => (
                          <option key={st} value={st} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  {/* Relationship and Temperature Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Relationship
                      </label>
                      <select
                        value={expressRelationship}
                        onChange={(e) => setExpressRelationship(e.target.value)}
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 focus:border-amber-500 focus:outline-none font-semibold"
                      >
                        <option value="Prospect">Prospect</option>
                        <option value="Client">Client</option>
                        <option value="Partner">Partner</option>
                        <option value="Vendor">Vendor</option>
                        <option value="Contractor">Contractor</option>
                        <option value="Competitor">Competitor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Temperature (Click to Cycle)
                      </label>
                      <button
                        type="button"
                        onClick={handleCycleTemperature}
                        className={`w-full py-1.5 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-between cursor-pointer shadow-xs ${
                          expressTemperature === 'Cold'
                            ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/60 hover:bg-cyan-900/80'
                            : expressTemperature === 'Warm'
                            ? 'bg-amber-950/80 text-amber-300 border-amber-500/60 hover:bg-amber-900/80'
                            : 'bg-rose-950/80 text-rose-300 border-rose-500/60 hover:bg-rose-900/80'
                        }`}
                        title="Click to cycle Lead Temperature: Cold -> Warm -> Hot"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm leading-none">
                            {expressTemperature === 'Cold' ? '❄️' : expressTemperature === 'Warm' ? '🌤️' : '🔥'}
                          </span>
                          <span>{expressTemperature} Lead</span>
                        </span>
                        <span className="text-[10px] font-normal opacity-70 underline">Cycle ↺</span>
                      </button>
                    </div>
                  </div>

                  {/* Company Phones */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">
                      Company Phone Numbers
                    </label>
                    {expressCompanyPhones.map((phoneItem, idx) => (
                      <div key={phoneItem.id ? `${phoneItem.id}_${idx}` : `ecp_${idx}`} className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                        <CustomLabelSelect
                          value={phoneItem.label}
                          onChange={(val) => handleCompanyPhoneChange(phoneItem.id, 'label', val)}
                          options={PHONE_LABEL_DEFAULT_OPTIONS}
                          className="w-28 sm:w-32"
                        />
                        <input
                          type="text"
                          value={phoneItem.number}
                          onChange={(e) => handleCompanyPhoneChange(phoneItem.id, 'number', e.target.value)}
                          placeholder="+971 4 123 4567"
                          className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-amber-500 focus:outline-hidden"
                        />
                        {/* Primary Dialed Radio Toggle */}
                        <button
                          type="button"
                          onClick={() => setPrimaryDialedPhoneId(phoneItem.id)}
                          className={`shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
                            primaryDialedPhoneId === phoneItem.id
                              ? 'bg-blue-600/30 text-blue-200 border-blue-400 font-extrabold shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                          }`}
                          title="Set as primary dialed target number for this activity log"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center shrink-0 ${
                            primaryDialedPhoneId === phoneItem.id ? 'border-blue-400 bg-blue-400' : 'border-slate-500'
                          }`}>
                            {primaryDialedPhoneId === phoneItem.id && <span className="w-1 h-1 rounded-full bg-slate-950" />}
                          </span>
                          <span>{primaryDialedPhoneId === phoneItem.id ? '🎯 Dialed' : 'Set Dialed'}</span>
                        </button>
                        {renderPhoneActionButton(phoneItem.number)}
                        {expressCompanyPhones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCompanyPhone(phoneItem.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Remove Phone"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddCompanyPhone}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>+ Add Company Phone</span>
                    </button>
                  </div>

                  {/* Company Emails */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Company Emails
                    </label>
                    {expressCompanyEmails.map((emailItem, idx) => (
                      <div key={emailItem.id ? `${emailItem.id}_${idx}` : `ece_${idx}`} className="flex items-center gap-1.5">
                        <CustomLabelSelect
                          value={emailItem.label}
                          onChange={(val) => handleCompanyEmailChange(emailItem.id, 'label', val)}
                          options={EMAIL_LABEL_DEFAULT_OPTIONS}
                          className="w-28 sm:w-32"
                        />
                        <input
                          type="email"
                          value={emailItem.email}
                          onChange={(e) => handleCompanyEmailChange(emailItem.id, 'email', e.target.value)}
                          placeholder="info@company.com"
                          className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-amber-500 focus:outline-hidden"
                        />
                        {expressCompanyEmails.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCompanyEmail(emailItem.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Remove Email"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddCompanyEmail}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>+ Add Company Email</span>
                    </button>
                  </div>

                  {/* Company Links */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-medium text-slate-300">Company Portals & Links</label>
                    <datalist id="express-link-tags">
                      <option value="Website" />
                      <option value="LinkedIn" />
                      <option value="Facebook" />
                      <option value="Instagram" />
                      <option value="Twitter" />
                      <option value="Portal" />
                    </datalist>
                    {expressCompanyLinks.map((linkItem, idx) => (
                      <div key={linkItem.id || `ecl_${idx}`} className="flex items-center gap-1.5">
                        <input
                          list="express-link-tags"
                          value={linkItem.label}
                          onChange={(e) => handleCompanyLinkChange(linkItem.id, 'label', e.target.value)}
                          placeholder="Tag (e.g. Website)"
                          className="w-28 sm:w-32 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none shrink-0"
                        />
                        <input
                          type="url"
                          value={linkItem.url}
                          onChange={(e) => handleCompanyLinkChange(linkItem.id, 'url', e.target.value)}
                          placeholder="https://..."
                          className="flex-1 min-w-0 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                        />
                        {expressCompanyLinks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCompanyLink(linkItem.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5"/>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddCompanyLink}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3"/>
                      <span>+ Add Link</span>
                    </button>
                  </div>
                </div>

                {/* SECTION 2: CONTACT PERSON DETAILS */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-800/80">
                    <User className="h-4 w-4 text-blue-400 shrink-0" />
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">
                      2. Contact Person Info (Optional)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Person Name
                      </label>
                      <input
                        type="text"
                        value={expressContactName}
                        onChange={(e) => setExpressContactName(e.target.value)}
                        placeholder="e.g. John Doe"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Designation / Role
                      </label>
                      <input
                        type="text"
                        value={expressContactRole}
                        onChange={(e) => setExpressContactRole(e.target.value)}
                        placeholder="e.g. Procurement Manager"
                        className="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Direct Phones */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Direct Phones
                    </label>
                    {expressContactPhones.map((phoneItem, idx) => (
                      <div key={phoneItem.id ? `${phoneItem.id}_${idx}` : `ctp_${idx}`} className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                        <CustomLabelSelect
                          value={phoneItem.label}
                          onChange={(val) => handleContactPhoneChange(phoneItem.id, 'label', val)}
                          options={PHONE_LABEL_DEFAULT_OPTIONS}
                          className="w-28 sm:w-32"
                        />
                        <input
                          type="text"
                          value={phoneItem.number}
                          onChange={(e) => handleContactPhoneChange(phoneItem.id, 'number', e.target.value)}
                          placeholder="+971 50 123 4567"
                          className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
                        />
                        {/* Primary Dialed Radio Toggle */}
                        <button
                          type="button"
                          onClick={() => setPrimaryDialedPhoneId(phoneItem.id)}
                          className={`shrink-0 flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
                            primaryDialedPhoneId === phoneItem.id
                              ? 'bg-blue-600/30 text-blue-200 border-blue-400 font-extrabold shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                          }`}
                          title="Set as primary dialed target number for this activity log"
                        >
                          <span className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center shrink-0 ${
                            primaryDialedPhoneId === phoneItem.id ? 'border-blue-400 bg-blue-400' : 'border-slate-500'
                          }`}>
                            {primaryDialedPhoneId === phoneItem.id && <span className="w-1 h-1 rounded-full bg-slate-950" />}
                          </span>
                          <span>{primaryDialedPhoneId === phoneItem.id ? '🎯 Dialed' : 'Set Dialed'}</span>
                        </button>
                        {renderPhoneActionButton(phoneItem.number)}
                        {expressContactPhones.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveContactPhone(phoneItem.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Remove Phone"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddContactPhone}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>+ Add Direct Phone</span>
                    </button>
                  </div>

                  {/* Direct Emails */}
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-xs font-medium text-slate-300">
                      Direct Emails
                    </label>
                    {expressContactEmails.map((emailItem, idx) => (
                      <div key={emailItem.id ? `${emailItem.id}_${idx}` : `cte_${idx}`} className="flex items-center gap-1.5">
                        <CustomLabelSelect
                          value={emailItem.label}
                          onChange={(val) => handleContactEmailChange(emailItem.id, 'label', val)}
                          options={EMAIL_LABEL_DEFAULT_OPTIONS}
                          className="w-28 sm:w-32"
                        />
                        <input
                          type="email"
                          value={emailItem.email}
                          onChange={(e) => handleContactEmailChange(emailItem.id, 'email', e.target.value)}
                          placeholder="direct@company.com"
                          className="flex-1 rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
                        />
                        {expressContactEmails.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveContactEmail(emailItem.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Remove Email"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddContactEmail}
                      className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      <Plus className="h-3 w-3" />
                      <span>+ Add Direct Email</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Channel Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Interaction Channel
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-950 p-2 rounded-xl border border-slate-800">
                {CHANNELS.map((ch) => {
                  const isSelected =
                    channel === ch ||
                    (isPhoneChannel(ch) && isPhoneChannel(channel)) ||
                    (isMessageChannel(ch) && isMessageChannel(channel)) ||
                    (ch.toLowerCase().includes('meeting') && String(channel).toLowerCase().includes('meeting')) ||
                    (isInternalTaskChannel(ch) && isInternalTaskChannel(channel));

                  const renderIcon = () => {
                    const norm = ch.toLowerCase();
                    if (norm.includes('call') || norm.includes('phone')) return <Phone className="h-4 w-4 shrink-0" />;
                    if (norm.includes('message') || norm.includes('whatsapp') || norm.includes('sms')) return <MessageSquare className="h-4 w-4 shrink-0" />;
                    if (norm.includes('email')) return <Mail className="h-4 w-4 shrink-0" />;
                    if (norm.includes('meeting')) return <Users className="h-4 w-4 shrink-0" />;
                    if (norm.includes('visit') || norm.includes('site')) return <MapPin className="h-4 w-4 shrink-0" />;
                    if (norm.includes('task') || norm.includes('admin')) return <Briefcase className="h-4 w-4 shrink-0" />;
                    return null;
                  };

                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => handleChannelSelect(ch as any)}
                      className={`flex items-center justify-center space-x-1.5 py-2.5 px-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      {renderIcon()}
                      <span className="text-center leading-tight whitespace-normal text-[11px] font-bold">{ch === "Message (WhatsApp/SMS)" ? "Message" : ch}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Status / Disposition Toggle */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                {(isMessageChannel(interactionChannel) ? "MESSAGE" : isInternalTask ? "TASK" : interactionChannel.toUpperCase())} STATUS / DISPOSITION
              </label>
              <div className="flex flex-wrap gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                {((isPhoneChannel(interactionChannel) && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(interactionChannel))
                  
                  .map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      const newStatus = st as CallStatus;
                      setStatus(newStatus);
                      if (!isSuccessStatus(newStatus)) {
                        setOutcome('');
                      }
                    }}
                    className={`flex-1 min-w-[100px] py-2 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer ${
                      status === st || (st === 'Scheduled / Planned' && status === 'Scheduled') || (st === 'Completed / Connected' && status === 'Completed')
                        ? 'bg-slate-800 text-blue-400 border border-blue-500/40 shadow-xs font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Outcome & Purpose Grid */}
            {!isInternalTask && (
              <div className={`grid gap-3 ${isCompletedState && !interactionChannel.toLowerCase().match(/email|message|whatsapp|sms/) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {isCompletedState && !interactionChannel.toLowerCase().match(/email|message|whatsapp|sms/) && (
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {interactionChannel.toUpperCase()} OUTCOME
                    </label>
                    <select
                      value={outcome}
                      onChange={(e) => {
                        setOutcome(e.target.value);
                        setValidationError(null);
                      }}
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-semibold cursor-pointer"
                    >
                      <option value="" disabled>
                        Select an outcome...
                      </option>
                      {(() => {
                        const dynamicOutcomes = callOutcomes?.length ? callOutcomes : OUTCOMES.map(o => ({ name: o, sentiment: POSITIVE_OUTCOMES.includes(o as any) ? 'positive' : NEUTRAL_OUTCOMES.includes(o as any) ? 'neutral' : 'negative' }));
                        const pos = dynamicOutcomes.filter(o => o.sentiment === 'positive');
                        const neu = dynamicOutcomes.filter(o => o.sentiment === 'neutral' || !o.sentiment);
                        const neg = dynamicOutcomes.filter(o => o.sentiment === 'negative');
                        
                        const allNames = dynamicOutcomes.map(o => o.name);
                        const legacyOption = outcome && !allNames.includes(outcome) ? outcome : null;

                        return (
                          <>
                            <optgroup label="🟢 POSITIVE / WINS">
                              {pos.map((o) => (
                                <option key={o.name} value={o.name}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="🟡 NEUTRAL / IN-PROGRESS">
                              {neu.map((o) => (
                                <option key={o.name} value={o.name}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="🔴 NEGATIVE / LOSSES">
                              {neg.map((o) => (
                                <option key={o.name} value={o.name}>
                                  {o.name}
                                </option>
                              ))}
                            </optgroup>
                            {legacyOption && (
                              <optgroup label="⚪ LEGACY OUTCOME">
                                <option value={legacyOption}>{legacyOption}</option>
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="quick-activity-purpose-select" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    {interactionChannel.toUpperCase()} PURPOSE
                  </label>
                  <select
                    id="quick-activity-purpose-select"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-semibold cursor-pointer"
                  >
                    {(() => {
                      const legacyOption = purpose && !availablePurposes.includes(purpose) ? purpose : null;
                      return (
                        <>
                          {availablePurposes.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                          {legacyOption && (
                            <option key={legacyOption} value={legacyOption}>
                              {legacyOption}
                            </option>
                          )}
                        </>
                      );
                    })()}
                  </select>
                </div>
              </div>
            )}

            {/* Requirement Notes & Voice Dictation */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {isInternalTask ? 'Task Details & Requirement Notes' : 'Activity & Requirement Notes'}
                </label>
                <div className="flex items-center gap-2">
                  {recognitionRef.current && (
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                        isListening
                          ? 'bg-rose-600 text-white animate-pulse'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                      <span>{isListening ? 'Listening...' : 'Dictate'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAiAssist('summarize_notes')}
                    disabled={isSummarizing || !notes.trim()}
                    className="px-2 py-1 rounded-md bg-purple-950/80 hover:bg-purple-900 border border-purple-800/80 text-purple-300 text-[11px] font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isSummarizing ? (
                      <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-purple-400" />
                    )}
                    <span>AI Polish</span>
                  </button>
                </div>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={isInternalTask ? 5 : 3}
                placeholder={isInternalTask ? "Document task details, internal checklist, admin progress, or deliverables..." : "Log discussion points, customer feedback, project specifications..."}
                className={`w-full rounded-xl bg-slate-950 border border-slate-800 p-3 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 transition-all ${
                  isInternalTask ? 'min-h-[120px]' : 'min-h-[80px]'
                }`}
              />
            </div>

            {/* Date & Follow-Up Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="flex flex-col justify-end h-full">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Activity Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                  max={getLocalDateTimeString()}
                  style={{ colorScheme: 'dark' }}
                  className="[color-scheme:dark] w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-hidden font-mono"
                />
              </div>

              {(() => {
                const isCurScheduled = status === 'Scheduled' || status === 'Scheduled / Planned' || status === 'Scheduled / Draft';
                const isFollowupEncouraged =
                  isCurScheduled ||
                  status === 'No Answer' ||
                  status === 'Busy' ||
                  outcome === 'Call Back Later' ||
                  outcome === 'Line Busy' ||
                  outcome === 'No Answer' ||
                  outcome === 'Follow-Up Scheduled';
                const isFollowupMissing = isFollowupEncouraged && !followupDate;

                return (
                  <div className="flex flex-col justify-end h-full">
                    <div className="flex flex-col mb-2 gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {isCurScheduled ? 'Scheduled Date & Time *' : 'Next Follow-up Date'}
                        </label>
                        {followupDate && (
                          <button
                            type="button"
                            onClick={() => setFollowupDate('')}
                            className="text-[10px] text-slate-400 hover:text-rose-300 font-semibold cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {isFollowupMissing && (
                        <div className="w-full">
                          <span className="text-[10px] font-bold text-amber-400 inline-flex items-center gap-1.5 bg-amber-950/80 px-2 py-1 rounded border border-amber-500/50 animate-pulse">
                            <AlertCircle className="w-3 h-3 text-amber-400 shrink-0" />
                            <span>Required for {isCurScheduled ? 'Scheduled tasks' : status === 'Busy' || status === 'No Answer' ? status : outcome || 'this disposition'}</span>
                          </span>
                        </div>
                      )}
                    </div>
                    <input
                      type="datetime-local"
                      value={followupDate}
                      onChange={(e) => setFollowupDate(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className={`[color-scheme:dark] w-full rounded-lg bg-slate-950 px-3 py-2 text-xs font-mono transition-all focus:outline-hidden ${
                        isFollowupMissing
                          ? 'border-2 border-amber-500/80 ring-2 ring-amber-500/30 bg-amber-950/20 text-amber-100'
                          : followupDate
                          ? 'border-2 border-blue-500/80 bg-blue-950/20 text-blue-100 font-bold'
                          : 'border border-slate-800 text-slate-100 focus:border-blue-500'
                      }`}
                    />

                    {/* Quick Set Buttons when follow-up missing */}
                    {isFollowupMissing && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-medium">Quick Set:</span>
                        {[
                          { label: '+1 Day', days: 1 },
                          { label: '+2 Days', days: 2 },
                          { label: '+3 Days', days: 3 },
                          { label: '+1 Week', days: 7 }
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + btn.days);
                              d.setHours(9, 0, 0, 0);
                              setFollowupDate(getLocalDateTimeString(d));
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 font-bold transition cursor-pointer"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Persistent Selected Date Display Badge */}
                    {followupDate && (
                      <div className="mt-2 flex items-center justify-between px-3 py-1.5 rounded-lg bg-blue-950/80 border border-blue-500/60 text-blue-200 text-xs font-mono font-bold shadow-xs">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span>Scheduled: {new Date(followupDate).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      </div>
                    )}

                    {/* Follow-Up Intent / Reason Input Field */}
                    {followupDate && (
                      <div className="mt-2.5">
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1">
                          Follow-up Intent / Agenda
                        </label>
                        <input
                          type="text"
                          value={followupIntent}
                          onChange={(e) => setFollowupIntent(e.target.value)}
                          placeholder="e.g. Check on PO approval, Send revised quote..."
                          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* DNC Opt-Out Checkbox */}
            <div className="pt-1">
              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-900/80 transition-colors">
                <input
                  type="checkbox"
                  checked={isDnc}
                  onChange={(e) => setIsDnc(e.target.checked)}
                  className="rounded-md border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500 h-4 w-4"
                />
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-rose-300 block">
                      Mark as Do-Not-Contact (DNC) / Opt-Out
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Suppresses contact from future dialer queues and outreach lists
                    </span>
                  </div>
                </div>
              </label>
            </div>

            {/* AI WhatsApp Draft Generator Section */}
            <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/40 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold text-purple-200">
                    WhatsApp Follow-Up Draft
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAiAssist('draft_whatsapp')}
                  disabled={isDraftingWhatsapp || !notes.trim()}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isDraftingWhatsapp ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>Generate Draft</span>
                </button>
              </div>

              {whatsappDraft ? (
                <div className="space-y-2 pt-1">
                  <textarea
                    value={whatsappDraft}
                    onChange={(e) => setWhatsappDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden font-sans"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCopyAndSendWhatsapp}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                    >
                      {copiedWhatsapp ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                      <span>{copiedWhatsapp ? 'Copied & Opening...' : 'Send via WhatsApp'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  Click 'Generate Draft' to create a personalized WhatsApp follow-up based on your notes.
                </p>
              )}
            </div>

            {aiError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 flex items-center justify-between text-xs text-rose-300">
                <span>{aiError}</span>
                <button
                  type="button"
                  onClick={() => setShowGeminiKeyModal(true)}
                  className="px-2 py-1 rounded-md bg-rose-900/80 hover:bg-rose-800 text-white text-[10px] font-semibold flex items-center gap-1 transition-colors shrink-0 ml-2 cursor-pointer"
                >
                  <KeyRound className="h-3 w-3" />
                  <span>Config Key</span>
                </button>
              </div>
            )}
          </form>

          {/* Drawer Footer Actions */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Reset Form
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                    <span>Saving Activity...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 text-white" />
                    <span>{existingLog || logToEdit ? 'Update Log' : 'Save Activity Log'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Gemini API Key Modal */}
      {showGeminiKeyModal && (
        <GeminiKeyModal
          isOpen={showGeminiKeyModal}
          onClose={() => setShowGeminiKeyModal(false)}
        />
      )}
    </AnimatePresence>
  );
};

export default QuickActivityDrawer;
