import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Phone,
  Building2,
  User,
  UserPlus,
  Calendar,
  Clock,
  CheckCircle2,
  CalendarClock,
  Ban,
  FileText,
  Loader2,
  ArrowRight,
  PhoneCall,
  History,
  ExternalLink,
  MessageSquare,
  Mail,
  Users,
  MapPin,
  Activity,
  Briefcase,
  PanelRightClose,
  PanelRightOpen,
  PhoneForwarded,
  PhoneMissed,
  Sparkles,
  ChevronRight,
  Check
} from 'lucide-react';
import { CallLogEntry, CallStatus, ActivityChannel, Contact, Company, Enquiry, isSamePhoneNumber, getCompanyPhones } from '../types';
import { safeSetDoc } from '../firebase';
import { ActivityLogRepository, CallLogRepository } from '../services/repositories/CallLogRepository';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import {
  CHANNELS,
  OUTCOMES,
  POSITIVE_OUTCOMES,
  NEUTRAL_OUTCOMES,
  NEGATIVE_OUTCOMES,
  getStatusesForChannel,
  getOutcomesForStatus,
  isSuccessStatus,
  getPurposesForChannel
} from '../utils/activityLogic';
import ContactModal from './ContactModal';
import Company360Modal from './Company360Modal';
import GoogleSearchButton from './common/GoogleSearchButton';
import TaskCallHistoryPanel from './TaskCallHistoryPanel';
import { IndustryBadge } from '../utils/taxonomy';
import { getWhatsAppUrl, sanitizeWhatsAppNumber } from '../utils/defaults';

export interface LiveExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: CallLogEntry | any | null;
  onSwitchTask?: (nextTask: CallLogEntry | null) => void;
  onSuccess?: (updatedTask: CallLogEntry, spawnedTask?: CallLogEntry) => void;
  user?: any;
  callLogs?: CallLogEntry[];
  contacts?: Contact[];
  companies?: Company[];
  enquiries?: Enquiry[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  callStatuses?: { name: string }[];
  callPurposes?: { name: string }[];
  callOutcomes?: { name: string; sentiment?: string }[];
}

type DispositionId = 'connected' | 'followup' | 'no_answer' | 'gatekeeper_busy' | 'invalid_number';

interface DispositionConfig {
  id: DispositionId;
  label: string;
  sublabel: string;
  status: string;
  defaultOutcome: string;
  defaultPreset: 'tomorrow' | '3days' | '1week' | 'clear';
  defaultIntent: string;
  activeClass: string;
  inactiveClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DISPOSITIONS: DispositionConfig[] = [
  {
    id: 'connected',
    label: 'Connected / Completed',
    sublabel: 'Spoke with contact',
    status: 'Completed / Connected',
    defaultOutcome: 'Information Gathered',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Follow-up on discussion',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30',
    inactiveClass: 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/80',
    icon: CheckCircle2
  },
  {
    id: 'followup',
    label: 'Follow-up Required',
    sublabel: 'Callback requested',
    status: 'Completed / Connected',
    defaultOutcome: 'Follow-up Scheduled',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Follow-up callback / review proposal',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30',
    inactiveClass: 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100/80',
    icon: CalendarClock
  },
  {
    id: 'no_answer',
    label: 'No Answer / Voicemail',
    sublabel: 'No reply or left VM',
    status: 'No Answer',
    defaultOutcome: 'No Response / Ghosted',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Retry call - No answer / left voicemail',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: PhoneMissed
  },
  {
    id: 'gatekeeper_busy',
    label: 'Gatekeeper / Busy',
    sublabel: 'Engaged or assistant barrier',
    status: 'Busy',
    defaultOutcome: 'Gatekeeper Blocked',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Retry call - Try bypass gatekeeper / line busy',
    activeClass: 'bg-orange-500 text-white border-orange-500 shadow-md ring-2 ring-orange-400/30',
    inactiveClass: 'bg-orange-50/80 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800/60 hover:bg-orange-100/80',
    icon: Users
  },
  {
    id: 'invalid_number',
    label: 'Invalid / Wrong Number',
    sublabel: 'Dead line or wrong contact',
    status: 'Invalid Number',
    defaultOutcome: 'Wrong Person / Unqualified',
    defaultPreset: 'clear',
    defaultIntent: '',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30',
    inactiveClass: 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100/80',
    icon: Ban
  }
];

export default function LiveExecutionModal({
  isOpen,
  onClose,
  task,
  onSwitchTask,
  onSuccess,
  user,
  callLogs = [],
  contacts = [],
  companies = [],
  enquiries = [],
  setCompanies,
  setContacts,
  setCallLogs,
  callStatuses,
  callPurposes,
  callOutcomes
}: LiveExecutionModalProps) {
  // Current active task state (can be switched smoothly to next lead in queue)
  const [currentTask, setCurrentTask] = useState<CallLogEntry | any>(task);

  useEffect(() => {
    setCurrentTask(task);
  }, [task]);

  // Read active channel with fallback to 'Phone Call'
  const initialTaskChannel: string = currentTask?.channel || 'Phone Call';
  const [currentChannel, setCurrentChannel] = useState<string>(initialTaskChannel);

  // Dynamically get available statuses based on channel from activityLogic
  const availableStatuses = useMemo(() => {
    return getStatusesForChannel(currentChannel).filter(s => s !== 'Scheduled' && s !== 'Scheduled / Planned');
  }, [currentChannel]);

  const availablePurposes = useMemo(() => {
    return getPurposesForChannel(currentChannel);
  }, [currentChannel]);

  // Default completed status
  const defaultCompletedStatus = useMemo(() => {
    return (
      availableStatuses.find((s) => isSuccessStatus(s)) ||
      availableStatuses[0] ||
      'Completed / Connected'
    );
  }, [availableStatuses]);

  const [activeDispositionId, setActiveDispositionId] = useState<DispositionId>('connected');
  const [callStatus, setCallStatus] = useState<string>(defaultCompletedStatus);
  const [callOutcome, setCallOutcome] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [isDnc, setIsDnc] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [followUpIntent, setFollowUpIntent] = useState<string>('');
  const [activePreset, setActivePreset] = useState<'tomorrow' | '3days' | '1week' | 'custom' | null>('tomorrow');
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Dynamic Contact details override (for Add Contact binding)
  const [activeContactId, setActiveContactId] = useState<string>('');
  const [activeContactName, setActiveContactName] = useState<string>('');
  const [activeContactPhone, setActiveContactPhone] = useState<string>('');

  // Ref for notes textarea
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Modals integration state
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);
  const [isCompany360Open, setIsCompany360Open] = useState<boolean>(false);

  // Expandable Call History Panel state (default: split-view on desktop, collapsed on mobile)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return false;
  });

  // Fetched history logs fallback if callLogs not passed
  const [fetchedCompanyLogs, setFetchedCompanyLogs] = useState<CallLogEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Re-initialize and reset form when currentTask or isOpen changes
  useEffect(() => {
    if (currentTask && isOpen) {
      const taskChan = currentTask.channel || 'Phone Call';
      setCurrentChannel(taskChan);

      const isCall = taskChan === 'Call' || taskChan === 'Phone Call';
      const validStatusesForDefault = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(taskChan);
      const defaultStatus = validStatusesForDefault.find((s) => isSuccessStatus(s)) || validStatusesForDefault[0] || 'Completed / Connected';
      
      const validPurposes = getPurposesForChannel(taskChan);
      setPurpose(currentTask.purpose || validPurposes[0] || 'Discovery / Validation');

      // Initialize disposition based on existing task state
      if (currentTask.status === 'Invalid Number') {
        setActiveDispositionId('invalid_number');
        setCallStatus('Invalid Number');
        setCallOutcome('Wrong Person / Unqualified');
        setNextFollowUpDate('');
        setActivePreset(null);
      } else if (currentTask.status === 'No Answer') {
        setActiveDispositionId('no_answer');
        setCallStatus('No Answer');
        setCallOutcome(currentTask.outcome || 'No Response / Ghosted');
      } else if (currentTask.status === 'Busy') {
        setActiveDispositionId('gatekeeper_busy');
        setCallStatus('Busy');
        setCallOutcome(currentTask.outcome || 'Gatekeeper Blocked');
      } else if (currentTask.outcome === 'Follow-up Scheduled' || currentTask.followup_intent) {
        setActiveDispositionId('followup');
        setCallStatus(defaultStatus);
        setCallOutcome('Follow-up Scheduled');
      } else {
        setActiveDispositionId('connected');
        setCallStatus(defaultStatus);
        setCallOutcome(currentTask.outcome || 'Information Gathered');
      }

      setIsDnc(Boolean(currentTask.is_dnc || currentTask.dnc));
      setNotes(currentTask.requirement_notes || currentTask.notes || '');
      setFollowUpIntent(currentTask.followup_intent || '');

      // Default next follow-up date to tomorrow at 10:00 AM (if not already set)
      if (currentTask.next_followup_date) {
        setNextFollowUpDate(currentTask.next_followup_date);
        setActivePreset('custom');
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        const offset = tomorrow.getTimezoneOffset() * 60000;
        const localIso = new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
        setNextFollowUpDate(localIso);
        setActivePreset('tomorrow');
      }

      // Initialize contact details
      setActiveContactId(currentTask.contact_id || '');
      setActiveContactName(currentTask.contact_name || '');
      setActiveContactPhone(currentTask.contact_phone || currentTask.phone_number || currentTask.phone || currentTask.unlinked_contact_info || '');

      // Auto-focus notes textarea on lead load
      setTimeout(() => {
        if (notesTextareaRef.current) {
          notesTextareaRef.current.focus();
        }
      }, 150);
    }
  }, [currentTask, isOpen, callStatuses]);

  // Update outcomes when status changes
  useEffect(() => {
    if (isOpen) {
      const normChan = currentChannel.toLowerCase();
      const isAsyncChannel = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
      const isSentStatus = callStatus.toLowerCase().includes('sent') || callStatus.toLowerCase().includes('delivered');

      if (isAsyncChannel && isSentStatus && callOutcome !== 'Message Sent / Awaiting Reply') {
        setCallOutcome('Message Sent / Awaiting Reply');
      } else if (callOutcome && !isSuccessStatus(callStatus)) {
        setCallOutcome('');
      }
    }
  }, [callStatus, callOutcome, isOpen, currentChannel]);

  // Fetch company history logs if not already provided in callLogs prop
  useEffect(() => {
    let isMounted = true;
    async function loadCompanyHistory() {
      if (!isOpen || !currentTask || !currentTask.company_id) {
        setFetchedCompanyLogs([]);
        return;
      }

      if (callLogs && callLogs.length > 0) {
        return;
      }

      setIsLoadingHistory(true);
      try {
        const allLogs = await ActivityLogRepository.getAllLocal();
        if (isMounted) {
          const matching = allLogs
            .filter((l) => l.company_id === currentTask.company_id && l.id !== currentTask.id)
            .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
            .slice(0, 100);
          setFetchedCompanyLogs(matching);
        }
      } catch (err) {
        console.error('Failed to load company history:', err);
      } finally {
        if (isMounted) setIsLoadingHistory(false);
      }
    }

    loadCompanyHistory();
    return () => {
      isMounted = false;
    };
  }, [isOpen, currentTask, callLogs]);

  // Derive recent company history
  const recentHistoryLogs = useMemo(() => {
    if (!currentTask || !currentTask.company_id) return [];
    if (callLogs && callLogs.length > 0) {
      return callLogs
        .filter((l) => l.company_id === currentTask.company_id && l.id !== currentTask.id)
        .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
        .slice(0, 100);
    }
    return fetchedCompanyLogs;
  }, [currentTask, callLogs, fetchedCompanyLogs]);

  // Derive other pending leads in queue
  const pendingLeads = useMemo(() => {
    if (!callLogs || callLogs.length === 0 || !currentTask) return [];
    return callLogs
      .filter((l) => {
        if (l.id === currentTask.id) return false;
        const isSched = ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(l.status as any);
        const isDncSuppressed = Boolean((l as any).is_dnc || (l as any).dnc);
        return isSched && !isDncSuppressed;
      })
      .sort((a, b) => {
        const dateA = new Date(a.next_followup_date || a.date || 0).getTime();
        const dateB = new Date(b.next_followup_date || b.date || 0).getTime();
        return dateA - dateB;
      });
  }, [callLogs, currentTask]);

  // Linked Company entity
  const linkedCompany = useMemo(() => {
    if (!currentTask?.company_id || !companies) return null;
    return companies.find((c) => c.id === currentTask.company_id) || null;
  }, [currentTask, companies]);

  // Company Mainline Phone resolution
  const companyMainPhone = useMemo(() => {
    if (!linkedCompany) return currentTask?.company_phone || '';
    const phoneList = getCompanyPhones(linkedCompany);
    if (phoneList && phoneList.length > 0 && phoneList[0].value) {
      return phoneList[0].value;
    }
    return linkedCompany.general_phone || linkedCompany.phone || currentTask?.company_phone || '';
  }, [linkedCompany, currentTask]);

  // Target Contact Person resolution
  const targetContact = useMemo(() => {
    const cId = activeContactId || currentTask?.contact_id;
    if (cId && contacts) {
      return contacts.find((c) => c.id === cId) || null;
    }
    return null;
  }, [activeContactId, currentTask, contacts]);

  const contactDesignation =
    targetContact?.designation ||
    targetContact?.role ||
    (currentTask as any)?.contact_designation ||
    (currentTask as any)?.designation ||
    'Decision Maker / Contact';

  // Direct contact phone number resolution
  const directPhone =
    activeContactPhone ||
    targetContact?.mobile ||
    targetContact?.phone ||
    targetContact?.landline ||
    (targetContact?.phones && targetContact.phones.length > 0
      ? (targetContact.phones[0] as any).number || (targetContact.phones[0] as any).value
      : '') ||
    currentTask?.contact_phone ||
    currentTask?.phone_number ||
    currentTask?.phone ||
    currentTask?.unlinked_contact_info ||
    '';

  const companyName = currentTask?.company_name || currentTask?.unlinked_name || linkedCompany?.display_name || 'No Company Account';
  const displayContactName = activeContactName || currentTask?.contact_name || targetContact?.full_name || 'No Contact Person';
  const originalAgenda = currentTask?.followup_intent || currentTask?.requirement_notes || currentTask?.notes || '';

  // Safe Guard Return (Must be after all hooks!)
  if (!isOpen || !currentTask) return null;

  const activeChannel = currentChannel;
  const isCompletedState = isSuccessStatus(callStatus);
  const availableOutcomes = getOutcomesForStatus(activeChannel, callStatus);

  const handleChannelChange = (newChan: string) => {
    setCurrentChannel(newChan);
    const isCall = newChan === 'Call' || newChan === 'Phone Call';
    const newStatuses = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(newChan);
    if (!newStatuses.includes(callStatus)) {
      const defaultSt = newStatuses.find((s) => isSuccessStatus(s)) || newStatuses[0] || 'Completed / Connected';
      setCallStatus(defaultSt);
      setCallOutcome('');
    }
  };

  // Helper for dynamic channel icon
  const renderChannelIcon = (chanName: string = activeChannel) => {
    const norm = chanName.toLowerCase();
    if (norm.includes('call') || norm.includes('phone')) {
      return <PhoneCall className="w-3.5 h-3.5" />;
    } else if (norm.includes('message') || norm.includes('whatsapp') || norm.includes('sms')) {
      return <MessageSquare className="w-3.5 h-3.5" />;
    } else if (norm.includes('email')) {
      return <Mail className="w-3.5 h-3.5" />;
    } else if (norm.includes('meeting')) {
      return <Users className="w-3.5 h-3.5" />;
    } else if (norm.includes('site visit') || norm.includes('visit') || norm.includes('site')) {
      return <MapPin className="w-3.5 h-3.5" />;
    } else if (norm.includes('task') || norm.includes('admin')) {
      return <Briefcase className="w-3.5 h-3.5" />;
    }
    return <Activity className="w-3.5 h-3.5" />;
  };

  // Clean URLs for dialing and WhatsApp
  const cleanTelUrl = (phoneStr: string) => {
    if (!phoneStr) return '#';
    const clean = phoneStr.replace(/[^\d+]/g, '');
    return `tel:${clean}`;
  };

  const cleanWhatsAppUrl = (phoneStr: string) => {
    return getWhatsAppUrl(phoneStr);
  };

  // 1-Click Disposition Matrix Selection
  const handleSelectDisposition = (disp: DispositionConfig) => {
    setActiveDispositionId(disp.id);
    setCallStatus(disp.status);
    setCallOutcome(disp.defaultOutcome);

    if (disp.defaultPreset === 'clear') {
      setNextFollowUpDate('');
      setActivePreset(null);
      setFollowUpIntent('');
    } else if (disp.defaultPreset) {
      applyFollowUpPreset(disp.defaultPreset, disp.defaultIntent);
    }
  };

  // Quick Follow-Up Preset Calculation
  const applyFollowUpPreset = (preset: 'tomorrow' | '3days' | '1week' | 'custom', customIntent?: string) => {
    setActivePreset(preset);
    if (customIntent !== undefined) {
      setFollowUpIntent(customIntent);
    }

    if (preset === 'custom') {
      const input = document.getElementById('next-followup-datetime') as HTMLInputElement;
      if (input) {
        input.focus();
        if (typeof (input as any).showPicker === 'function') {
          try { (input as any).showPicker(); } catch {}
        }
      }
      return;
    }

    const targetDate = new Date();
    if (preset === 'tomorrow') {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (preset === '3days') {
      targetDate.setDate(targetDate.getDate() + 3);
    } else if (preset === '1week') {
      targetDate.setDate(targetDate.getDate() + 7);
    }

    targetDate.setHours(10, 0, 0, 0);
    const offset = targetDate.getTimezoneOffset() * 60000;
    const localIso = new Date(targetDate.getTime() - offset).toISOString().slice(0, 16);
    setNextFollowUpDate(localIso);
  };

  // Timestamp Insertion Helper
  const handleInsertTimestamp = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    const timestampTag = `[${timeStr}]: `;

    if (notesTextareaRef.current) {
      const textarea = notesTextareaRef.current;
      const start = textarea.selectionStart ?? notes.length;
      const end = textarea.selectionEnd ?? notes.length;
      const before = notes.substring(0, start);
      const after = notes.substring(end);
      const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
      const inserted = (needsLeadingNewline ? '\n' : '') + timestampTag;
      const newText = before + inserted + after;
      setNotes(newText);
      const newCursorPos = start + inserted.length;
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      setNotes((prev) => (prev ? `${prev}\n${timestampTag}` : timestampTag));
    }
  };

  // Skip / Pass Action (Muted ghost button)
  const handleSkipLead = () => {
    if (pendingLeads.length > 0) {
      const nextLead = pendingLeads[0];
      if (onSwitchTask) {
        onSwitchTask(nextLead);
      }
      setCurrentTask(nextLead);
    } else {
      if (onSwitchTask) {
        onSwitchTask(null);
      }
      onClose();
    }
  };

  // Primary Execution Submission (Save & Close or Save & Next Lead)
  const executeSubmission = async (advanceToNext: boolean) => {
    if (!currentTask || !currentTask.id || isSubmitting) return;

    // Default outcome safeguard for completed calls
    let finalOutcome = callOutcome;
    if (!finalOutcome && (activeDispositionId === 'connected' || activeDispositionId === 'followup')) {
      finalOutcome = activeDispositionId === 'followup' ? 'Follow-up Scheduled' : 'Information Gathered';
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const userUid = user?.uid || 'system_op';
      const userName = user?.full_name || user?.username || user?.email || 'Operator';

      const updatedStatus: string = callStatus;
      const finalNotes: string = notes.trim()
        ? currentTask.requirement_notes
          ? `${currentTask.requirement_notes}\n[Notes]: ${notes.trim()}`
          : notes.trim()
        : currentTask.requirement_notes || '';

      // Step 0: Upstream Contact Sync for 'Invalid Number' and DNC
      const targetContactId = activeContactId || currentTask.contact_id;
      const targetPhone = directPhone;
      const isInvalidStatus = updatedStatus === 'Invalid Number' || callStatus === 'Invalid Number';
      const isDncTriggered = isDnc || (finalOutcome && (finalOutcome.toLowerCase().includes('dnc') || finalOutcome.toLowerCase().includes('opt-out')));

      if (targetContactId) {
        try {
          const localContacts = await CompanyRepository.getContactsLocal();
          const existingCt = localContacts.find((c) => c.id === targetContactId) || (contacts || []).find((c) => c.id === targetContactId);

          if (existingCt) {
            let updatedContact: Contact = { ...existingCt };
            let hasContactChanges = false;

            if (isInvalidStatus && targetPhone) {
              let matchedInArray = false;
              if (updatedContact.phones && updatedContact.phones.length > 0) {
                updatedContact.phones = updatedContact.phones.map((p: any) => {
                  if (isSamePhoneNumber(p.number || p.value, targetPhone)) {
                    matchedInArray = true;
                    return {
                      ...p,
                      isInvalid: true,
                      is_invalid: true
                    };
                  }
                  return p;
                });
              }
              if (!matchedInArray && (isSamePhoneNumber(updatedContact.mobile, targetPhone) || isSamePhoneNumber(updatedContact.landline, targetPhone) || isSamePhoneNumber(updatedContact.phone, targetPhone))) {
                updatedContact.phones = [
                  ...(updatedContact.phones || []),
                  {
                    id: `phone_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                    number: targetPhone,
                    value: targetPhone,
                    label: 'Mobile',
                    tag: 'Mobile',
                    isInvalid: true,
                    is_invalid: true
                  }
                ];
              }
              updatedContact.restricted_lines = {
                ...(updatedContact.restricted_lines || {}),
                [targetPhone.trim()]: 'Invalid'
              };
              hasContactChanges = true;
            }

            if (isDncTriggered) {
              updatedContact.is_dnc = true;
              updatedContact.dnc = true;
              updatedContact.dnc_reason = updatedContact.dnc_reason || 'Opt-Out from Live Execution Command Center';
              hasContactChanges = true;
            }

            if (hasContactChanges) {
              updatedContact.updatedAt = nowIso;
              await safeSetDoc('contacts', updatedContact.id!, updatedContact);
              await CompanyRepository.updateContact(updatedContact.id!, updatedContact);
              if (setContacts) {
                setContacts((prev) => prev.map((c) => (c.id === updatedContact.id ? updatedContact : c)));
              }
            }
          }
        } catch (contactSyncErr) {
          console.warn('[LiveExecutionModal] Upstream contact sync failed:', contactSyncErr);
        }
      }

      // Step 1: Update the CURRENT task's database record
      const updatedTaskRecord: CallLogEntry = {
        ...currentTask,
        channel: currentChannel as ActivityChannel,
        contact_id: activeContactId || currentTask.contact_id,
        contact_name: activeContactName || currentTask.contact_name,
        contact_phone: activeContactPhone || directPhone || currentTask.contact_phone,
        status: updatedStatus as CallStatus,
        outcome: finalOutcome,
        purpose: purpose || currentTask.purpose || 'Follow-up / Check-in',
        requirement_notes: finalNotes,
        date: nowIso,
        updatedAt: nowIso,
        last_modified_by_uid: userUid,
        last_modified_by_name: userName,
        completed_at: nowIso,
        completedAt: nowIso,
        executed_at: nowIso,
        ...(nextFollowUpDate ? { next_followup_date: nextFollowUpDate } : {})
      };

      await safeSetDoc('activity_logs', currentTask.id, updatedTaskRecord);
      await safeSetDoc('call_logs', currentTask.id, updatedTaskRecord);
      await CallLogRepository.save(updatedTaskRecord);

      // Step 2: Spawn Follow-Up task if nextFollowUpDate is specified
      let spawnedFollowUpTask: CallLogEntry | undefined = undefined;
      if (nextFollowUpDate && nextFollowUpDate.trim() !== '') {
        const spawnedId = `act_${Date.now()}_fup_${Math.random().toString(36).substring(2, 7)}`;
        spawnedFollowUpTask = {
          id: spawnedId,
          workspace_id: currentTask.workspace_id || 'ws_default',
          company_id: currentTask.company_id,
          company_name: currentTask.company_name || currentTask.unlinked_name || companyName,
          contact_id: activeContactId || currentTask.contact_id,
          contact_name: activeContactName || currentTask.contact_name || displayContactName,
          contact_phone: activeContactPhone || directPhone || currentTask.contact_phone,
          channel: (currentChannel as ActivityChannel) || 'Phone Call',
          date: nextFollowUpDate,
          status: 'Scheduled / Planned' as CallStatus,
          outcome: 'Follow-Up Scheduled',
          purpose: currentTask.purpose || 'Follow-up / Check-in',
          requirement_notes: followUpIntent.trim() ? followUpIntent.trim() : (notes.trim() ? `Follow up on: ${notes.trim()}` : ''),
          followup_intent: followUpIntent.trim() || undefined,
          logged_by: userName,
          sales_person: userName,
          created_by_uid: userUid,
          created_by_name: userName,
          createdAt: nowIso,
          updatedAt: nowIso
        };

        await safeSetDoc('activity_logs', spawnedId, spawnedFollowUpTask);
        await safeSetDoc('call_logs', spawnedId, spawnedFollowUpTask);
        await CallLogRepository.save(spawnedFollowUpTask);
      }

      // Step 3: Trigger onSuccess callback
      if (onSuccess) {
        onSuccess(updatedTaskRecord, spawnedFollowUpTask);
      }

      // Step 4: Advance to next lead or close
      if (advanceToNext) {
        const remainingLeads = (callLogs || []).filter((l) => {
          if (l.id === currentTask.id) return false;
          const isSched = ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(l.status as any);
          const isDncSuppressed = Boolean((l as any).is_dnc || (l as any).dnc);
          return isSched && !isDncSuppressed;
        });

        if (remainingLeads.length > 0) {
          const nextLead = remainingLeads[0];
          if (onSwitchTask) {
            onSwitchTask(nextLead);
          }
          setCurrentTask(nextLead);
        } else {
          if (onSwitchTask) {
            onSwitchTask(null);
          }
          onClose();
        }
      } else {
        if (onSwitchTask) {
          onSwitchTask(null);
        }
        onClose();
      }
    } catch (err) {
      console.error('Failed to execute resolution:', err);
      alert('Error saving activity log resolution. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className={`relative w-full ${isHistoryExpanded ? 'max-w-6xl' : 'max-w-3xl'} bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[95vh] overflow-hidden transition-all duration-200`}>
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                  Live Execution Command Center
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {pendingLeads.length > 0 ? `${pendingLeads.length + 1} In Queue` : 'Queue Lead'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                High-speed dialing, 1-click dispositions & rapid notes
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* History Feed Quick Toggle */}
            <button
              type="button"
              id="header-toggle-history-panel-button"
              onClick={() => setIsHistoryExpanded((prev) => !prev)}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                isHistoryExpanded
                  ? 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 shadow-2xs'
              }`}
              title="Toggle Chronological Activity Feed"
            >
              <History className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Activity History</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-extrabold bg-blue-600 text-white">
                {recentHistoryLogs.length}
              </span>
              {isHistoryExpanded ? (
                <PanelRightClose className="w-3.5 h-3.5 ml-0.5 text-slate-400" />
              ) : (
                <PanelRightOpen className="w-3.5 h-3.5 ml-0.5 text-slate-400" />
              )}
            </button>

            {/* Modal Close Button */}
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Split View Body */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left Pane: Active Command Center Dialer */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Company Header with Google Search & Two-Tier Industry Badge */}
              <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="flex items-start space-x-2.5">
                    <div className="p-2 bg-blue-100/70 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 mt-0.5">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <h3 className="font-extrabold text-base text-slate-900 dark:text-white leading-tight">
                          {companyName}
                        </h3>
                        {companyName && companyName !== 'No Company Account' && (
                          <GoogleSearchButton
                            companyName={companyName}
                            location={linkedCompany?.city || undefined}
                            size="xs"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <IndustryBadge company={linkedCompany} size="xs" showEmpty />
                        {linkedCompany?.city && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {linkedCompany.city}{linkedCompany.country ? `, ${linkedCompany.country}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {currentTask?.company_id && (
                    <button
                      type="button"
                      id="open-company-360-header-btn"
                      onClick={() => setIsCompany360Open(true)}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                      title="Open Complete Company 360 History"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                      <span>Company 360</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Dual-Track Contact Deck */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* a) Target Contact Person Card */}
                <div className="p-3.5 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        <User className="w-3.5 h-3.5" />
                        <span>Target Contact Person</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsContactModalOpen(true)}
                        className="inline-flex items-center space-x-1 text-[11px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer transition"
                        title="Add or edit contact person"
                      >
                        <UserPlus className="w-3 h-3" />
                        <span>+ Add / Edit</span>
                      </button>
                    </div>

                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {displayContactName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                      {contactDesignation}
                    </div>
                  </div>

                  {/* Direct Number & 1-Click Action Buttons */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Direct Number</div>
                      <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {directPhone || <span className="text-slate-400 font-normal italic">No direct number</span>}
                      </div>
                    </div>

                    {directPhone ? (
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          id="target-contact-call-button"
                          href={cleanTelUrl(directPhone)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                          title={`Call ${displayContactName} (${directPhone})`}
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                        <a
                          id="target-contact-whatsapp-button"
                          href={cleanWhatsAppUrl(directPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-2xs transition cursor-pointer"
                          title={`WhatsApp message to ${displayContactName}`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsContactModalOpen(true)}
                        className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Add Phone
                      </button>
                    )}
                  </div>
                </div>

                {/* b) Company Mainline Card */}
                <div className="p-3.5 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200/90 dark:border-slate-700 shadow-2xs flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        <PhoneForwarded className="w-3.5 h-3.5 text-amber-500" />
                        <span>Company Mainline</span>
                      </div>
                      <span className="text-[10px] font-medium text-slate-400">Switchboard</span>
                    </div>

                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {companyName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      General Reception / Office Line
                    </div>
                  </div>

                  {/* Mainline Number & 1-Click Call / WhatsApp Buttons */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Switchboard</div>
                      <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {companyMainPhone || <span className="text-slate-400 font-normal italic">No switchboard listed</span>}
                      </div>
                    </div>

                    {companyMainPhone ? (
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          id="company-mainline-call-button"
                          href={cleanTelUrl(companyMainPhone)}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-2xs transition cursor-pointer"
                          title={`Call Switchboard (${companyMainPhone})`}
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                        <a
                          id="company-mainline-whatsapp-button"
                          href={cleanWhatsAppUrl(companyMainPhone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                          title={`WhatsApp Switchboard (${companyMainPhone})`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400">Not registered</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Read-Only Original Agenda / Prior Notes */}
              {originalAgenda && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                  <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    <FileText className="w-3 h-3 text-slate-400" />
                    <span>Prior Agenda / Interaction Intent</span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {originalAgenda}
                  </p>
                </div>
              )}

              {/* Dynamic Interaction Channel Selector */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Interaction Channel
                  </label>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    Auto-updates valid dispositions
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl">
                  {CHANNELS.map((ch) => {
                    const isSelected = activeChannel === ch;
                    return (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => handleChannelChange(ch)}
                        className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        {renderChannelIcon(ch)}
                        <span className="truncate">{ch}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tactile 1-Click Disposition Matrix */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                    <span>1-Click Call Disposition</span>
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Pre-selects standard next-step defaults
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {DISPOSITIONS.map((disp) => {
                    const isActive = activeDispositionId === disp.id;
                    const IconComp = disp.icon;
                    return (
                      <button
                        key={disp.id}
                        type="button"
                        id={`disposition-btn-${disp.id}`}
                        onClick={() => handleSelectDisposition(disp)}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer flex flex-col justify-between min-h-[76px] ${
                          isActive ? disp.activeClass : disp.inactiveClass
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <IconComp className="w-4 h-4 shrink-0" />
                          {isActive && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="font-bold text-xs leading-tight">
                            {disp.label}
                          </div>
                          <div className={`text-[10px] mt-0.5 leading-tight ${isActive ? 'text-white/80' : 'text-slate-500 dark:text-slate-400'}`}>
                            {disp.sublabel}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Outcome Refinement / Fine-Tuning Dropdown */}
                {isCompletedState && availableOutcomes.length > 0 && !activeChannel.toLowerCase().match(/email|message|whatsapp|sms/) && (
                  <div className="pt-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Detailed Outcome / Conversation Result
                      </label>
                      <span className="text-[10px] text-slate-400">Optional refinement</span>
                    </div>
                    <select
                      id="activity-outcome-select"
                      value={callOutcome}
                      onChange={(e) => setCallOutcome(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition cursor-pointer"
                    >
                      <option value="" disabled>Select conversation outcome...</option>
                      {(() => {
                        const dynamicOutcomes = callOutcomes?.length ? callOutcomes : OUTCOMES.map(o => ({ name: o, sentiment: POSITIVE_OUTCOMES.includes(o as any) ? 'positive' : NEUTRAL_OUTCOMES.includes(o as any) ? 'neutral' : 'negative' }));
                        const pos = dynamicOutcomes.filter(o => o.sentiment === 'positive');
                        const neu = dynamicOutcomes.filter(o => o.sentiment === 'neutral' || !o.sentiment);
                        const neg = dynamicOutcomes.filter(o => o.sentiment === 'negative');
                        const allNames = dynamicOutcomes.map(o => o.name);
                        const legacyOption = callOutcome && !allNames.includes(callOutcome) ? callOutcome : null;

                        return (
                          <>
                            <optgroup label="🟢 POSITIVE / PROGRESS">
                              {pos.map((o) => (
                                <option key={o.name} value={o.name}>{o.name}</option>
                              ))}
                            </optgroup>
                            <optgroup label="🟡 NEUTRAL / IN-PROGRESS">
                              {neu.map((o) => (
                                <option key={o.name} value={o.name}>{o.name}</option>
                              ))}
                            </optgroup>
                            <optgroup label="🔴 OBJECTION / LOSS">
                              {neg.map((o) => (
                                <option key={o.name} value={o.name}>{o.name}</option>
                              ))}
                            </optgroup>
                            {legacyOption && (
                              <optgroup label="⚪ CURRENT OUTCOME">
                                <option value={legacyOption}>{legacyOption}</option>
                              </optgroup>
                            )}
                          </>
                        );
                      })()}
                    </select>
                  </div>
                )}
              </div>

              {/* Live Notes Scratchpad & Quick Timestamps */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>Live Notes Scratchpad</span>
                  </label>
                  <button
                    type="button"
                    id="insert-timestamp-button"
                    onClick={handleInsertTimestamp}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/60 text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-2xs"
                    title="Insert current local timestamp at cursor position"
                  >
                    <Clock className="w-3 h-3 text-blue-500" />
                    <span>+ Timestamp</span>
                  </button>
                </div>

                <textarea
                  id="execution-notes-textarea"
                  ref={notesTextareaRef}
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Type live call notes, objection notes, decision-maker feedback, or requirements gathered..."
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition placeholder:text-slate-400 resize-none font-sans leading-relaxed"
                />

                {/* DNC Opt-out bar */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-900/40">
                  <label className="flex items-center space-x-2 text-xs font-semibold text-rose-700 dark:text-rose-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      id="live-execution-dnc-toggle"
                      checked={isDnc}
                      onChange={(e) => setIsDnc(e.target.checked)}
                      className="rounded border-rose-300 dark:border-rose-700 text-rose-600 focus:ring-rose-500 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span>Mark Contact as Do Not Call (DNC) / Opt-Out</span>
                  </label>
                  {isDnc && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white uppercase tracking-wider shadow-xs">
                      DNC Active
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Follow-Up Date Presets */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-blue-500" />
                    <span>Next Follow-Up Scheduling</span>
                  </label>
                  {nextFollowUpDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setNextFollowUpDate('');
                        setActivePreset(null);
                      }}
                      className="text-[11px] font-semibold text-rose-500 hover:text-rose-700 dark:hover:text-rose-400 cursor-pointer"
                    >
                      Clear Schedule
                    </button>
                  )}
                </div>

                {/* Quick Presets Row */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    id="preset-tomorrow-button"
                    onClick={() => applyFollowUpPreset('tomorrow')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      activePreset === 'tomorrow'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    +1 Day (Tomorrow)
                  </button>
                  <button
                    type="button"
                    id="preset-3days-button"
                    onClick={() => applyFollowUpPreset('3days')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      activePreset === '3days'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    +3 Days
                  </button>
                  <button
                    type="button"
                    id="preset-1week-button"
                    onClick={() => applyFollowUpPreset('1week')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      activePreset === '1week'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    +1 Week
                  </button>
                  <button
                    type="button"
                    id="preset-custom-button"
                    onClick={() => applyFollowUpPreset('custom')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      activePreset === 'custom'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    Custom Date/Time
                  </button>
                </div>

                {/* Datetime picker + Intent Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Scheduled Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      id="next-followup-datetime"
                      value={nextFollowUpDate}
                      onChange={(e) => {
                        setNextFollowUpDate(e.target.value);
                        setActivePreset('custom');
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Follow-Up Intent / Next Step
                    </label>
                    <input
                      type="text"
                      value={followUpIntent}
                      onChange={(e) => setFollowUpIntent(e.target.value)}
                      placeholder="e.g. Call back regarding quote revisions..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Streamlined Navigation Footer (Pinned Sticky Bottom) */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 shrink-0">
              {/* Left: Skip / Pass (Muted ghost button) */}
              <button
                type="button"
                id="skip-lead-button"
                disabled={isSubmitting}
                onClick={handleSkipLead}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                title="Skip this lead without modifying and advance to next lead"
              >
                Skip / Pass {pendingLeads.length > 0 ? `(${pendingLeads.length} left)` : ''}
              </button>

              {/* Right: Save & Close (Secondary) and Save & Next Lead (Primary) */}
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  id="save-and-close-button"
                  disabled={isSubmitting}
                  onClick={() => executeSubmission(false)}
                  className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span className="flex items-center space-x-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </span>
                  ) : (
                    'Save & Close'
                  )}
                </button>

                <button
                  type="button"
                  id="save-and-next-lead-button"
                  disabled={isSubmitting}
                  onClick={() => executeSubmission(true)}
                  className="px-4.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Lead...</span>
                    </>
                  ) : (
                    <>
                      <span>Save & Next Lead</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Dedicated Expandable Call History Panel (Right Pane on Desktop / Split View) */}
          {isHistoryExpanded && (
            <div className="w-full md:w-5/12 lg:w-2/5 flex flex-col border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-800 max-h-[380px] md:max-h-none overflow-hidden shrink-0">
              <TaskCallHistoryPanel
                companyName={companyName}
                companyId={currentTask.company_id}
                historyLogs={recentHistoryLogs}
                isLoading={isLoadingHistory}
                isExpanded={isHistoryExpanded}
                onToggleExpand={() => setIsHistoryExpanded(false)}
                onOpenCompany360={() => setIsCompany360Open(true)}
                contacts={contacts}
              />
            </div>
          )}
        </div>
      </div>

      {/* Full Contact Creation Modal */}
      {isContactModalOpen && (
        <ContactModal
          isOpen={isContactModalOpen}
          onClose={() => setIsContactModalOpen(false)}
          companyId={currentTask.company_id}
          companies={companies}
          activeWorkspaceId={currentTask.workspace_id || 'ws_default'}
          user={user || { uid: 'system_op', email: 'operator@crm.local', name: 'Operator' }}
          setContacts={setContacts}
          setCompanies={setCompanies}
          setCallLogs={setCallLogs}
          onSaved={(savedContact: Contact) => {
            if (savedContact) {
              setActiveContactId(savedContact.id || '');
              setActiveContactName(savedContact.full_name || '');
              const primaryPhone =
                savedContact.phone ||
                (savedContact.phones && savedContact.phones.length > 0
                  ? (savedContact.phones[0] as any).number || (savedContact.phones[0] as any).value
                  : '') ||
                '';
              setActiveContactPhone(primaryPhone);
            }
            setIsContactModalOpen(false);
          }}
        />
      )}

      {/* Full 360 Company History & Profile Modal */}
      {isCompany360Open && currentTask?.company_id && (
        <Company360Modal
          companyId={currentTask.company_id}
          companies={companies}
          contacts={contacts}
          enquiries={enquiries}
          callLogs={callLogs}
          user={user || { uid: 'system_op', email: 'operator@crm.local', name: 'Operator' }}
          setCompanies={setCompanies}
          setContacts={setContacts}
          setCallLogs={setCallLogs}
          onClose={() => setIsCompany360Open(false)}
        />
      )}
    </div>
  );
}
