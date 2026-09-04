import React, { useState, useEffect, useMemo } from 'react';
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
  Briefcase
} from 'lucide-react';
import { CallLogEntry, CallStatus, ActivityChannel, Contact, Company, Enquiry, isSamePhoneNumber } from '../types';
import { safeSetDoc } from '../firebase';
import { ActivityLogRepository, CallLogRepository } from '../services/repositories/CallLogRepository';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import {
  CHANNELS,
  PURPOSES,
  OUTCOMES,
  POSITIVE_OUTCOMES,
  NEUTRAL_OUTCOMES,
  NEGATIVE_OUTCOMES,
  getStatusesForChannel,
  getOutcomesForStatus,
  isSuccessStatus,
  getPurposesForChannel
} from '../utils/activityLogic';
import { formatActivityDate } from './CallLogManager';
import ContactModal from './ContactModal';
import Company360Modal from './Company360Modal';
import GoogleSearchButton from './common/GoogleSearchButton';

export interface LiveExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: CallLogEntry | any | null;
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
  callOutcomes?: { name: string, sentiment?: string }[];
}

export default function LiveExecutionModal({
  isOpen,
  onClose,
  task,
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
  // Read active channel from task.channel with fallback to 'Phone Call'
  const initialTaskChannel: string = task?.channel || 'Phone Call';
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

  const [resolutionAction, setResolutionAction] = useState<'complete' | 'reschedule' | 'cancel'>('complete');
  const [callStatus, setCallStatus] = useState<string>(defaultCompletedStatus);
  const [callOutcome, setCallOutcome] = useState<string>('');
  const [purpose, setPurpose] = useState<string>('');
  const [isDnc, setIsDnc] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [followUpIntent, setFollowUpIntent] = useState<string>('');

  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Dynamic Contact details override (for Add Contact binding)
  const [activeContactId, setActiveContactId] = useState<string>('');
  const [activeContactName, setActiveContactName] = useState<string>('');
  const [activeContactPhone, setActiveContactPhone] = useState<string>('');

  // Modals integration state
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);
  const [isCompany360Open, setIsCompany360Open] = useState<boolean>(false);

  // Fetched history logs fallback if callLogs not passed
  const [fetchedCompanyLogs, setFetchedCompanyLogs] = useState<CallLogEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Initialize and reset form when task or isOpen changes
  useEffect(() => {
    if (task && isOpen) {
      const taskChan = task.channel || 'Phone Call';
      setCurrentChannel(taskChan);
      setResolutionAction('complete');
      const isCall = taskChan === 'Call' || taskChan === 'Phone Call';
      const validStatusesForDefault = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(taskChan);
      const defaultStatus = validStatusesForDefault.find((s) => isSuccessStatus(s)) || validStatusesForDefault[0] || 'Completed / Connected';
      setCallStatus(defaultStatus);
      const validPurposes = getPurposesForChannel(taskChan);
      setPurpose(task.purpose || validPurposes[0] || 'Discovery / Validation');
      

      setCallOutcome(task.outcome || '');
      setIsDnc(Boolean(task.is_dnc || task.dnc));
      setNotes(task.requirement_notes || task.notes || '');
      setFollowUpIntent('');
      
      // Default next follow-up date to tomorrow at 10:00 AM
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const offset = tomorrow.getTimezoneOffset() * 60000;
      const localIso = new Date(tomorrow.getTime() - offset).toISOString().slice(0, 16);
      setNextFollowUpDate(localIso);

      // Initialize contact details
      setActiveContactId(task.contact_id || '');
      setActiveContactName(task.contact_name || '');
      setActiveContactPhone(task.contact_phone || task.phone_number || task.phone || task.unlinked_contact_info || '');
    }
  }, [task, isOpen]);

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
      if (!isOpen || !task || !task.company_id) {
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
            .filter((l) => l.company_id === task.company_id && l.id !== task.id)
            .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
            .slice(0, 5);
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
  }, [isOpen, task, callLogs]);

  // Derive recent company history
  const recentHistoryLogs = useMemo(() => {
    if (!task || !task.company_id) return [];
    if (callLogs && callLogs.length > 0) {
      return callLogs
        .filter((l) => l.company_id === task.company_id && l.id !== task.id)
        .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())
        .slice(0, 5);
    }
    return fetchedCompanyLogs;
  }, [task, callLogs, fetchedCompanyLogs]);

  // Safe Guard Return (Must be after all hooks!)
  if (!isOpen || !task) return null;

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
      return <PhoneCall className="w-4 h-4" />;
    } else if (norm.includes('message') || norm.includes('whatsapp') || norm.includes('sms')) {
      return <MessageSquare className="w-4 h-4" />;
    } else if (norm.includes('email')) {
      return <Mail className="w-4 h-4" />;
    } else if (norm.includes('meeting')) {
      return <Users className="w-4 h-4" />;
    } else if (norm.includes('site visit') || norm.includes('visit') || norm.includes('site')) {
      return <MapPin className="w-4 h-4" />;
    } else if (norm.includes('task') || norm.includes('admin')) {
      return <Briefcase className="w-4 h-4" />;
    }
    return <Activity className="w-4 h-4" />;
  };

  const companyName = task.company_name || task.unlinked_name || 'No Company Account';
  const displayContactName = activeContactName || task.contact_name || 'No Contact Person';
  const displayPhone = activeContactPhone || task.contact_phone || task.phone_number || task.phone || task.unlinked_contact_info || '';
  const originalAgenda = task.followup_intent || task.requirement_notes || task.notes || 'No prior agenda notes attached.';

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !task.id || isSubmitting) return;

    // Validation: Block execution if completed/connected state and outcome not selected
    const normChan = activeChannel.toLowerCase();
    const isAsyncChannel = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
    const isSentStatus = callStatus.toLowerCase().includes('sent') || callStatus.toLowerCase().includes('delivered');
    const isOutcomeRequired = !(isAsyncChannel && isSentStatus);

    if (resolutionAction === 'complete' && isCompletedState && availableOutcomes.length > 0 && isOutcomeRequired && (!callOutcome || !callOutcome.trim())) {
      alert(`Please select an outcome before completing this ${activeChannel.toLowerCase()}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const userUid = user?.uid || 'system_op';
      const userName = user?.full_name || user?.username || user?.email || 'Operator';

      let updatedStatus: string = callStatus;
      let updatedOutcome: string | undefined = task.outcome;
      let finalNotes: string = task.requirement_notes || '';

      if (resolutionAction === 'cancel') {
        updatedStatus = 'Cancelled';
        updatedOutcome = '';
        finalNotes = notes.trim()
          ? finalNotes
            ? `${finalNotes}\n[Cancelled]: ${notes.trim()}`
            : `[Cancelled]: ${notes.trim()}`
          : finalNotes;
      } else if (resolutionAction === 'reschedule') {
        updatedStatus = 'Rescheduled';
        updatedOutcome = '';
        finalNotes = notes.trim()
          ? finalNotes
            ? `${finalNotes}\n[Rescheduled]: ${notes.trim()}`
            : `[Rescheduled]: ${notes.trim()}`
          : finalNotes;
      } else {
        // resolutionAction === 'complete'
        updatedStatus = callStatus;
        updatedOutcome = isCompletedState ? (isAsyncChannel ? 'Message Sent / Awaiting Reply' : (callOutcome || '')) : '';
        finalNotes = notes.trim()
          ? finalNotes
            ? `${finalNotes}\n[Execution Notes]: ${notes.trim()}`
            : notes.trim()
          : finalNotes;
      }

      // Step 0: Upstream Contact Sync for 'Invalid Number' and DNC
      const targetContactId = activeContactId || task.contact_id;
      const targetPhone = activeContactPhone || task.phone_number || task.contact_phone || task.phone || task.unlinked_contact_info || '';
      const isInvalidStatus = updatedStatus === 'Invalid Number' || callStatus === 'Invalid Number';
      const isDncTriggered = isDnc || (callOutcome && (callOutcome.toLowerCase().includes('dnc') || callOutcome.toLowerCase().includes('opt-out')));

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

      // Step 1: Update the CURRENT task's database record (including updated contact if modified)
      const updatedTaskRecord: CallLogEntry = {
        ...task,
        channel: currentChannel as ActivityChannel,
        contact_id: activeContactId || task.contact_id,
        contact_name: activeContactName || task.contact_name,
        contact_phone: activeContactPhone || task.contact_phone,
        status: updatedStatus as CallStatus,
        outcome: updatedOutcome,
        purpose: purpose,
        requirement_notes: finalNotes,
        date: resolutionAction === 'complete' ? nowIso : task.date,
        updatedAt: nowIso,
        last_modified_by_uid: userUid,
        last_modified_by_name: userName,
        completed_at: nowIso,
        completedAt: nowIso,
        executed_at: nowIso,
        ...(nextFollowUpDate && resolutionAction !== 'cancel' ? { next_followup_date: nextFollowUpDate } : {})
      };

      await safeSetDoc('activity_logs', task.id, updatedTaskRecord);
      await safeSetDoc('call_logs', task.id, updatedTaskRecord);
      await CallLogRepository.save(updatedTaskRecord);

      // Step 2 (The Spawner): IF complete or reschedule AND nextFollowUpDate has a value
      let spawnedFollowUpTask: CallLogEntry | undefined = undefined;
      if (
        (resolutionAction === 'complete' || resolutionAction === 'reschedule') &&
        nextFollowUpDate &&
        nextFollowUpDate.trim() !== ''
      ) {
        const spawnedId = `act_${Date.now()}_fup_${Math.random().toString(36).substring(2, 7)}`;
        spawnedFollowUpTask = {
          id: spawnedId,
          workspace_id: task.workspace_id || 'ws_default',
          company_id: task.company_id,
          company_name: task.company_name || task.unlinked_name,
          contact_id: activeContactId || task.contact_id,
          contact_name: activeContactName || task.contact_name,
          contact_phone: activeContactPhone || task.contact_phone || task.phone_number || task.phone,
          channel: (currentChannel as ActivityChannel) || task.channel || 'Phone Call',
          date: nextFollowUpDate,
          status: 'Scheduled / Planned' as CallStatus,
          outcome: 'Follow-Up Scheduled',
          purpose: task.purpose || 'Follow-up / Check-in',
          requirement_notes: followUpIntent.trim() 
            ? followUpIntent.trim() 
            : (resolutionAction === 'reschedule' ? (task.requirement_notes || '') : ''),
          followup_intent: followUpIntent.trim() 
            ? followUpIntent.trim() 
            : (resolutionAction === 'reschedule' ? task.followup_intent : undefined),
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

      // Step 3: Await database writes, trigger onSuccess and close
      if (onSuccess) {
        onSuccess(updatedTaskRecord, spawnedFollowUpTask);
      }
      onClose();
    } catch (err) {
      console.error('Error executing task resolution:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="live-execution-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="live-execution-modal-container"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100 animate-in zoom-in-95 duration-150"
      >
        {/* Modal Top Bar (Sticky Header) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl">
              {renderChannelIcon()}
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                Live Execution Command Center
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Log resolution, review history, and spawn scheduled follow-ups
              </p>
            </div>
          </div>
          <button
            id="close-live-execution-modal-button"
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <form onSubmit={handleExecute} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Target Task Briefing Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {companyName}
                </span>
                {companyName && companyName !== 'No Company Account' && (
                  <GoogleSearchButton
                    companyName={companyName}
                    location={task?.company_id && companies ? companies.find(c => c.id === task.company_id)?.city : undefined}
                    size="xs"
                  />
                )}
              </div>

              {/* Contact with Sleek "+ Add Contact" Button */}
              <div className="flex items-center space-x-2 text-xs">
                <div className="flex items-center space-x-1 text-slate-600 dark:text-slate-300">
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-semibold">{displayContactName}</span>
                </div>
                <button
                  type="button"
                  id="open-add-contact-modal-button"
                  onClick={() => setIsContactModalOpen(true)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition cursor-pointer"
                  title="Add new contact person"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>+ Add Contact</span>
                </button>
              </div>
            </div>

            {/* Direct Phone Number Bar */}
            {displayPhone && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
                <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{displayPhone}</span>
                </div>
                <a
                  href={`tel:${displayPhone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-bold text-xs shadow-xs"
                >
                  <PhoneCall className="w-3 h-3" />
                  <span>Call Now</span>
                </a>
              </div>
            )}

            {/* Read-Only Original Agenda */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                <FileText className="w-3 h-3 text-slate-400" />
                <span>Original Agenda / Notes</span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                {originalAgenda}
              </p>
            </div>

            {/* FEATURE 1: Recent Company History */}
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <History className="w-3 h-3 text-blue-500" />
                  <span>Recent Company History</span>
                </div>
                {isLoadingHistory && (
                  <span className="text-[10px] text-slate-400 flex items-center space-x-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    <span>Loading...</span>
                  </span>
                )}
              </div>

              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {recentHistoryLogs.length > 0 ? (
                  recentHistoryLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          {formatActivityDate(log.date || log.createdAt)}
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {log.channel || 'Call'}
                          </span>
                          {(() => {
                            const stLower = (log.status || '').toLowerCase();
                            const isComp = stLower === 'completed log' || stLower === 'completed' || stLower.includes('conducted') || stLower.includes('sent');
                            const isInv = stLower === 'invalid number' || stLower === 'cancelled' || stLower.includes('invalid') || stLower.includes('wrong');
                            const isNoAns = stLower.includes('no answer') || stLower.includes('busy') || stLower.includes('voicemail');
                            const badgeColor = isComp
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : isInv
                              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                              : isNoAns
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
                            return (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                                {log.status}
                              </span>
                            );
                          })()}
                          {(() => {
                            const normChan = (log.channel || log.interaction_type || '').toLowerCase();
                            const isAsync = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
                            if (isAsync && log.purpose) {
                              return (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  {log.purpose}
                                </span>
                              );
                            }
                            if (log.outcome) {
                              return (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  {log.outcome}
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      {log.requirement_notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 italic">
                          "{log.requirement_notes}"
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-2.5 text-center bg-slate-50 dark:bg-slate-800/40 rounded-lg text-[11px] text-slate-400">
                    No prior activity logs recorded for this company account.
                  </div>
                )}
              </div>

              {/* View Full History Button */}
              {task?.company_id && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    id="open-company-360-history-button"
                    onClick={() => setIsCompany360Open(true)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/80 transition cursor-pointer shadow-2xs"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>View Full History</span>
                  </button>
                </div>
              )}
            </div>
          </div>

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

          {/* 3-Way Action Toggle */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Select Resolution Action
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
              <button
                type="button"
                id="action-toggle-complete"
                onClick={() => setResolutionAction('complete')}
                className={`flex items-center justify-center space-x-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  resolutionAction === 'complete'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Complete {activeChannel}</span>
              </button>

              <button
                type="button"
                id="action-toggle-reschedule"
                onClick={() => setResolutionAction('reschedule')}
                className={`flex items-center justify-center space-x-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  resolutionAction === 'reschedule'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Just Reschedule</span>
              </button>

              <button
                type="button"
                id="action-toggle-cancel"
                onClick={() => setResolutionAction('cancel')}
                className={`flex items-center justify-center space-x-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  resolutionAction === 'cancel'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-700/50'
                }`}
              >
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Cancel {activeChannel}</span>
              </button>
            </div>
          </div>

          {/* Conditional Form Fields */}
          {resolutionAction === 'complete' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Dynamic Purpose Select Dropdown */}
              {availablePurposes.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {activeChannel} Purpose <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer font-medium"
                  >
                    {availablePurposes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Dynamic Status / Disposition Toggle */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {activeChannel} Status / Disposition
                </label>
                <div className="flex flex-wrap gap-1.5 bg-slate-50 dark:bg-slate-800/40 p-1.5 rounded-xl">
                  {availableStatuses.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setCallStatus(st);
                        if (!isSuccessStatus(st)) {
                          setCallOutcome('');
                        }
                      }}
                      className={`flex-1 min-w-[100px] py-2 px-2 rounded-lg text-xs font-medium transition-all text-center cursor-pointer ${
                        callStatus === st || (st === 'Scheduled / Planned' && callStatus === 'Scheduled') || (st === 'Completed / Connected' && callStatus === 'Completed')
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Outcome Select Dropdown */}
              {isCompletedState && availableOutcomes.length > 0 && !activeChannel.toLowerCase().match(/email|message|whatsapp|sms/) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {activeChannel} Outcome 
                    <span className="text-rose-500 ml-1">*</span>
                  </label>
                  <select
                    id="activity-outcome-select"
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer font-medium"
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
                        const legacyOption = callOutcome && !allNames.includes(callOutcome) ? callOutcome : null;

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



              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {activeChannel} Summary & Notes
                </label>
                <textarea
                  id="execution-notes-textarea"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summarize key takeaways, client response, requirement updates..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition placeholder:text-slate-400 resize-none"
                />
              </div>

              {/* DNC Toggle */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40">
                <label className="flex items-center space-x-2 text-xs font-semibold text-rose-700 dark:text-rose-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="live-execution-dnc-toggle"
                    checked={isDnc}
                    onChange={(e) => setIsDnc(e.target.checked)}
                    className="rounded border-rose-300 dark:border-rose-700 text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                  />
                  <span>Mark Contact as Do Not Call (DNC) / Opt-Out</span>
                </label>
                {isDnc && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white uppercase tracking-wider shadow-xs">
                    DNC Active
                  </span>
                )}
              </div>

              {/* Next Follow-Up Date Input */}
              <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {resolutionAction === 'complete' && ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(callStatus) 
                        ? 'Scheduled Date & Time (Spawner) *' 
                        : 'Next Follow-Up Date & Time (Optional Spawner)'}
                    </span>
                  </label>
                  {nextFollowUpDate && (
                    <button
                      type="button"
                      onClick={() => setNextFollowUpDate('')}
                      className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="datetime-local"
                  id="next-followup-datetime"
                  required={resolutionAction === 'complete' && ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(callStatus)}
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-mono"
                />
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  Setting a date creates a linked task in your queue automatically.
                </p>
                {nextFollowUpDate && (
                  <div className="pt-2 border-t border-emerald-100/50 dark:border-emerald-800/30">
                    <label className="block text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                      Follow-Up Intent / Agenda
                    </label>
                    <input
                      type="text"
                      value={followUpIntent}
                      onChange={(e) => setFollowUpIntent(e.target.value)}
                      placeholder="e.g. Discuss revised proposal, finalize contract..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {resolutionAction === 'reschedule' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Next Follow-Up Date Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Scheduled Date & Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="reschedule-datetime"
                  required
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition font-mono"
                />
              </div>

              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reschedule Reason & Agenda
                </label>
                <textarea
                  id="reschedule-notes-textarea"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={`e.g. Client requested ${activeChannel.toLowerCase()} reschedule due to management review...`}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition placeholder:text-slate-400 resize-none"
                />
              </div>
            </div>
          )}

          {resolutionAction === 'cancel' && (
            <div className="space-y-3.5 animate-in fade-in duration-150">
              {/* Notes Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Cancellation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="cancel-notes-textarea"
                  rows={2}
                  required
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Project dropped, wrong contact details, client opted out..."
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition placeholder:text-slate-400 resize-none"
                />
              </div>
            </div>
          )}

          {/* Action Buttons (Sticky Footer inside form) */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2 px-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              id="confirm-execute-resolution-button"
              disabled={isSubmitting}
              className={`py-2 px-4 rounded-xl text-xs font-bold text-white shadow-sm transition flex items-center space-x-1.5 cursor-pointer ${
                resolutionAction === 'cancel'
                  ? 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400'
                  : resolutionAction === 'reschedule'
                  ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400'
                  : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>
                    {resolutionAction === 'cancel'
                      ? 'Confirm Cancellation'
                      : resolutionAction === 'reschedule'
                      ? `Reschedule ${activeChannel}`
                      : `Complete ${activeChannel}`}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Full Contact Creation Modal */}
      {isContactModalOpen && (
        <ContactModal
          isOpen={isContactModalOpen}
          onClose={() => setIsContactModalOpen(false)}
          companyId={task.company_id}
          companies={companies}
          activeWorkspaceId={task.workspace_id || 'ws_default'}
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
      {isCompany360Open && task?.company_id && (
        <Company360Modal
          companyId={task.company_id}
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
