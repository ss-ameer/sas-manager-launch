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
  Check,
  Target,
  FileCheck,
  Tag,
  ChevronDown,
  Copy,
  Video,
  Navigation,
  CalendarX,
  AlertTriangle,
  ShieldAlert,
  PhoneOff
} from 'lucide-react';
import {
  CallLogEntry,
  CallStatus,
  ActivityChannel,
  Contact,
  Company,
  Enquiry,
  isSamePhoneNumber,
  getCompanyPhones,
  getCompanyEmails,
  getContactPhones,
  getContactEmails
} from '../types';
import { safeSetDoc } from '../firebase';
import { ActivityLogRepository, CallLogRepository } from '../services/repositories/CallLogRepository';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { isTaskPending, TaskService } from '../services/taskService';
import { getReferenceId } from '../utils/refId';
import {
  CHANNELS,
  OUTCOMES,
  POSITIVE_OUTCOMES,
  NEUTRAL_OUTCOMES,
  NEGATIVE_OUTCOMES,
  MasterActivityChannel,
  getStatusesForChannel,
  getOutcomesForStatus,
  isSuccessStatus,
  getPurposesForChannel,
  isContactUnassigned,
  resolveContactByPhoneNumber,
  resolveGeographyFromCompany
} from '../utils/activityLogic';
import ContactModal from './ContactModal';
import Company360Modal from './Company360Modal';
import CallLogDetailModal from './CallLogDetailModal';
import GoogleSearchButton from './common/GoogleSearchButton';
import { CompanyActivityTimeline } from './common/CompanyActivityTimeline';
import { IndustryBadge } from '../utils/taxonomy';
import { SYSTEM_CALL_PURPOSES, getWhatsAppUrl, sanitizeWhatsAppNumber } from '../utils/defaults';

export interface LiveExecutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: CallLogEntry | any | null;
  taskQueue?: CallLogEntry[];
  queue?: CallLogEntry[];
  initialIndex?: number;
  onSwitchTask?: (nextTask: CallLogEntry | null) => void;
  onSuccess?: (updatedTask: CallLogEntry, spawnedTask?: CallLogEntry) => void;
  onCompleteTask?: (completedTask: CallLogEntry, advanceToNext: boolean) => void;
  onRescheduleTask?: (rescheduledTask: CallLogEntry, newDate: string, notes?: string) => void;
  onCancelTask?: (cancelledTask: CallLogEntry, reason?: string) => void;
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
  activeWorkspace?: any;
}

function parseTaskScheduledDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  const clean = dateStr.replace(/\s+/g, ' ').trim();
  const dmyMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const res = new Date(year, month, day, hours, minutes, seconds);
    if (!isNaN(res.getTime())) return res;
  }
  const sanitized = clean.replace(/\s*[-•]\s*/g, ' ');
  d = new Date(sanitized);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function isTaskOverdue(dateStr?: string): boolean {
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

function isTaskDueToday(dateStr?: string): boolean {
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

function normalizeModalFollowUpChannel(raw?: string): MasterActivityChannel {
  if (!raw) return 'Phone Call';
  const lower = raw.toLowerCase().trim();
  if (lower.includes('phone') || lower.includes('call')) return 'Phone Call';
  if (lower.includes('message') || lower.includes('whatsapp') || lower.includes('sms')) return 'Message (WhatsApp/SMS)';
  if (lower.includes('email') || lower.includes('mail')) return 'Email';
  if (lower.includes('meeting')) return 'Meeting (Virtual/In-Person)';
  if (lower.includes('site') || lower.includes('visit')) return 'Site Visit';
  return 'Phone Call';
}

function isTaskUpcoming(dateStr?: string): boolean {
  if (!dateStr) return false;
  const parsed = parseTaskScheduledDate(dateStr);
  if (!parsed) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return parsed.getTime() > endOfToday.getTime();
}

type DispositionId = string;

interface DispositionConfig {
  id: DispositionId;
  label: string;
  sublabel: string;
  status: string;
  defaultOutcome: string;
  defaultPreset: 'laterToday' | 'thisAfternoon' | 'tomorrow' | '3days' | '1week' | 'clear';
  defaultIntent: string;
  activeClass: string;
  inactiveClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CALL_DISPOSITIONS: DispositionConfig[] = [
  {
    id: 'connected',
    label: 'Connected',
    sublabel: 'Spoke with contact',
    status: 'Completed',
    defaultOutcome: 'Information Gathered',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Follow-up on discussion',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30',
    inactiveClass: 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/80',
    icon: CheckCircle2
  },
  {
    id: 'scheduled',
    label: 'Scheduled / Planned',
    sublabel: 'Outreach planned for future',
    status: 'Scheduled',
    defaultOutcome: 'Follow-up Scheduled',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Scheduled outreach follow-up',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30',
    inactiveClass: 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100/80',
    icon: CalendarClock
  },
  {
    id: 'no_answer_busy',
    label: 'No Answer / Busy',
    sublabel: 'No reply, busy, or voicemail',
    status: 'No Answer',
    defaultOutcome: 'No Response / Ghosted',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Retry call - No answer or line busy',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: PhoneMissed
  },
  {
    id: 'call_dropped',
    label: 'Call Dropped',
    sublabel: 'Line cut or abrupt disconnect',
    status: 'Follow-Up Required',
    defaultOutcome: 'Call Dropped / Disconnected',
    defaultPreset: 'laterToday',
    defaultIntent: 'Call dropped / disconnected - Retry callback',
    activeClass: 'bg-amber-600 text-white border-amber-600 shadow-md ring-2 ring-amber-500/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: PhoneOff
  },
  {
    id: 'invalid',
    label: 'Invalid Number',
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

export const MEETING_DISPOSITIONS: DispositionConfig[] = [
  {
    id: 'meeting_completed',
    label: 'Meeting Completed',
    sublabel: 'Session conducted',
    status: 'Completed',
    defaultOutcome: 'Meeting Booked',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Send meeting recap & agreed action items',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30',
    inactiveClass: 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/80',
    icon: CheckCircle2
  },
  {
    id: 'meeting_followup',
    label: 'Follow-up Required',
    sublabel: 'Action items pending',
    status: 'Completed',
    defaultOutcome: 'Follow-up Scheduled',
    defaultPreset: '3days',
    defaultIntent: 'Follow-up on meeting action items',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30',
    inactiveClass: 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100/80',
    icon: CalendarClock
  },
  {
    id: 'meeting_noshow',
    label: 'Client No-Show',
    sublabel: 'Client missed session',
    status: 'Cancelled',
    defaultOutcome: 'No Response / Ghosted',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Reach out to reschedule missed meeting',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30',
    inactiveClass: 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100/80',
    icon: CalendarX
  },
  {
    id: 'meeting_rescheduled',
    label: 'Rescheduled / Postponed',
    sublabel: 'Moved to future date',
    status: 'Rescheduled',
    defaultOutcome: 'Follow-up Scheduled',
    defaultPreset: '3days',
    defaultIntent: 'Confirm rescheduled meeting timing',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: Clock
  }
];

export const SITE_VISIT_DISPOSITIONS: DispositionConfig[] = [
  {
    id: 'site_completed',
    label: 'Site Inspected / Completed',
    sublabel: 'On-site review complete',
    status: 'Completed',
    defaultOutcome: 'Information Gathered',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Compile site audit report & proposal',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30',
    inactiveClass: 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/80',
    icon: CheckCircle2
  },
  {
    id: 'site_followup',
    label: 'Follow-up Required',
    sublabel: 'Action items pending',
    status: 'Completed',
    defaultOutcome: 'Quote / Proposal Requested',
    defaultPreset: '3days',
    defaultIntent: 'Submit quote based on site inspection',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30',
    inactiveClass: 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100/80',
    icon: CalendarClock
  },
  {
    id: 'site_denied',
    label: 'Client Not Available / Denied',
    sublabel: 'No entry or access denied',
    status: 'Cancelled',
    defaultOutcome: 'Gatekeeper Blocked',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Contact client to obtain site access / reschedule',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30',
    inactiveClass: 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100/80',
    icon: Ban
  },
  {
    id: 'site_rescheduled',
    label: 'Rescheduled',
    sublabel: 'Moved to new date',
    status: 'Rescheduled',
    defaultOutcome: 'Follow-up Scheduled',
    defaultPreset: '3days',
    defaultIntent: 'Confirm revised site visit schedule',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: Clock
  }
];

export const INTERNAL_TASK_DISPOSITIONS: DispositionConfig[] = [
  {
    id: 'task_completed',
    label: 'Task Completed',
    sublabel: 'Deliverable finalized',
    status: 'Completed',
    defaultOutcome: 'Information Gathered',
    defaultPreset: 'clear',
    defaultIntent: '',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30',
    inactiveClass: 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/80',
    icon: CheckCircle2
  },
  {
    id: 'task_inprogress',
    label: 'In Progress / Working',
    sublabel: 'Active task ongoing',
    status: 'In Progress',
    defaultOutcome: 'Active Negotiation',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Continue internal task execution',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30',
    inactiveClass: 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100/80',
    icon: Clock
  },
  {
    id: 'task_blocked',
    label: 'Blocked / Awaiting Info',
    sublabel: 'Dependency blocker',
    status: 'In Progress',
    defaultOutcome: 'No Response / Ghosted',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Unblock task - request required inputs',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: AlertTriangle
  }
];

export const EMAIL_DISPOSITIONS: DispositionConfig[] = [
  {
    id: 'email_sent',
    label: 'Email Sent / Delivered',
    sublabel: 'Dispatched to contact',
    status: 'Sent / Completed',
    defaultOutcome: 'Quote / Info Sent',
    defaultPreset: '3days',
    defaultIntent: 'Check for reply / follow up on email',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30',
    inactiveClass: 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/80',
    icon: CheckCircle2
  },
  {
    id: 'email_followup',
    label: 'Follow-up Scheduled',
    sublabel: 'Planned email cadence',
    status: 'Sent / Completed',
    defaultOutcome: 'Follow-up Scheduled',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Send follow-up email',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30',
    inactiveClass: 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100/80',
    icon: CalendarClock
  },
  {
    id: 'email_awaiting',
    label: 'Awaiting Reply',
    sublabel: 'Pending client response',
    status: 'Sent / Completed',
    defaultOutcome: 'Message Sent / Awaiting Reply',
    defaultPreset: '3days',
    defaultIntent: 'Follow-up on unanswered email',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: Clock
  },
  {
    id: 'email_bounced',
    label: 'Bounced / Invalid Email',
    sublabel: 'Delivery failed',
    status: 'Failed / Bounced',
    defaultOutcome: 'Wrong Person / Unqualified',
    defaultPreset: 'clear',
    defaultIntent: '',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30',
    inactiveClass: 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100/80',
    icon: Ban
  }
];

export const WHATSAPP_DISPOSITIONS: DispositionConfig[] = [
  {
    id: 'wa_sent',
    label: 'Message Delivered',
    sublabel: 'Chat sent via WhatsApp',
    status: 'Sent / Completed',
    defaultOutcome: 'Message Sent / Awaiting Reply',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Check for WhatsApp reply',
    activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-500/30',
    inactiveClass: 'bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100/80',
    icon: CheckCircle2
  },
  {
    id: 'wa_followup',
    label: 'Follow-up Required',
    sublabel: 'Planned message cadence',
    status: 'Sent / Completed',
    defaultOutcome: 'Follow-up Scheduled',
    defaultPreset: 'tomorrow',
    defaultIntent: 'Follow-up on WhatsApp chat',
    activeClass: 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-500/30',
    inactiveClass: 'bg-blue-50/80 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100/80',
    icon: CalendarClock
  },
  {
    id: 'wa_noresponse',
    label: 'No Response / Read',
    sublabel: 'No reply received',
    status: 'Sent / Completed',
    defaultOutcome: 'No Response / Ghosted',
    defaultPreset: '3days',
    defaultIntent: 'Follow-up on unreplied WhatsApp message',
    activeClass: 'bg-amber-500 text-white border-amber-500 shadow-md ring-2 ring-amber-400/30',
    inactiveClass: 'bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/80',
    icon: Clock
  },
  {
    id: 'wa_invalid',
    label: 'Not on WhatsApp / Invalid',
    sublabel: 'Failed to reach number',
    status: 'Failed / Bounced',
    defaultOutcome: 'Wrong Person / Unqualified',
    defaultPreset: 'clear',
    defaultIntent: '',
    activeClass: 'bg-rose-600 text-white border-rose-600 shadow-md ring-2 ring-rose-500/30',
    inactiveClass: 'bg-rose-50/80 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100/80',
    icon: Ban
  }
];

export function getDispositionsForChannel(channelName: string): DispositionConfig[] {
  const norm = (channelName || '').trim().toLowerCase();
  if (norm.includes('meeting')) {
    return MEETING_DISPOSITIONS;
  }
  if (norm.includes('visit') || norm.includes('site')) {
    return SITE_VISIT_DISPOSITIONS;
  }
  if (norm.includes('task') || norm.includes('internal') || norm.includes('admin')) {
    return INTERNAL_TASK_DISPOSITIONS;
  }
  if (norm.includes('email')) {
    return EMAIL_DISPOSITIONS;
  }
  if (norm.includes('whatsapp') || norm.includes('message') || norm.includes('sms')) {
    return WHATSAPP_DISPOSITIONS;
  }
  return CALL_DISPOSITIONS;
}

export const DISPOSITIONS: DispositionConfig[] = CALL_DISPOSITIONS;

export default function LiveExecutionModal({
  isOpen,
  onClose,
  task,
  taskQueue,
  queue,
  initialIndex = 0,
  onSwitchTask,
  onSuccess,
  onCompleteTask,
  onRescheduleTask,
  onCancelTask,
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
  callOutcomes,
  activeWorkspace
}: LiveExecutionModalProps) {
  const queueProp = taskQueue || queue;
  const [activeQueue, setActiveQueue] = useState<CallLogEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(initialIndex || 0);
  // Current active task state (advances strictly forward along activeQueue)
  const [currentTask, setCurrentTask] = useState<CallLogEntry | any>(task);
  const wasOpenRef = useRef<boolean>(false);

  // Initialize or re-sync active queue strictly when modal opens
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      let resolved: CallLogEntry[] = [];

      if (queueProp && queueProp.length > 0) {
        resolved = queueProp.filter((entry) => {
          if (entry.is_deleted) return false;
          const s = (entry.status || '').toLowerCase().trim();
          if (
            s === 'superseded' ||
            s === 'cancelled' ||
            s === 'canceled' ||
            s === 'completed' ||
            s === 'completed log' ||
            s.startsWith('completed')
          ) {
            return false;
          }
          return isTaskPending(entry);
        });
      } else {
        // Fallback: derive strictly filtered queue (Overdue + Due Today only, upcoming strictly excluded)
        const eligible = (callLogs || []).filter((entry) => {
          if (entry.is_deleted) return false;
          const s = (entry.status || '').toLowerCase().trim();
          if (
            s === 'superseded' ||
            s === 'cancelled' ||
            s === 'canceled' ||
            s === 'completed' ||
            s === 'completed log' ||
            s.startsWith('completed')
          ) {
            return false;
          }
          if (!isTaskPending(entry)) return false;
          const isDnc = Boolean((entry as any).is_dnc || (entry as any).dnc);
          if (isDnc) return false;

          const dateStr = entry.next_followup_date || entry.date;
          if (isTaskUpcoming(dateStr)) return false;
          return isTaskOverdue(dateStr) || isTaskDueToday(dateStr);
        });

        const overdueTasks: CallLogEntry[] = [];
        const todayTasks: CallLogEntry[] = [];

        for (const item of eligible) {
          const dateStr = item.next_followup_date || item.date;
          if (isTaskOverdue(dateStr)) {
            overdueTasks.push(item);
          } else {
            todayTasks.push(item);
          }
        }

        overdueTasks.sort((a, b) => {
          const timeA = parseTaskScheduledDate(a.next_followup_date || a.date)?.getTime() || 0;
          const timeB = parseTaskScheduledDate(b.next_followup_date || b.date)?.getTime() || 0;
          return timeA - timeB;
        });

        todayTasks.sort((a, b) => {
          const timeA = parseTaskScheduledDate(a.next_followup_date || a.date)?.getTime() || 0;
          const timeB = parseTaskScheduledDate(b.next_followup_date || b.date)?.getTime() || 0;
          return timeA - timeB;
        });

        resolved = [...overdueTasks, ...todayTasks];

        // If a specific task was passed and not in resolved, include it
        if (task && task.id && !resolved.some((q) => q.id === task.id)) {
          resolved = [task, ...resolved];
        }
      }

      // Enforce Single Active Pending Task invariant per company in activeQueue
      const companyMapQueue = new Map<string, CallLogEntry>();
      const unlinkedQueue: CallLogEntry[] = [];
      for (const item of resolved) {
        const cId = item.company_id?.trim();
        if (!cId) {
          unlinkedQueue.push(item);
        } else if (!companyMapQueue.has(cId)) {
          companyMapQueue.set(cId, item);
        }
      }
      resolved = [...Array.from(companyMapQueue.values()), ...unlinkedQueue];

      let startIdx = 0;
      if (typeof initialIndex === 'number' && initialIndex >= 0 && initialIndex < resolved.length) {
        startIdx = initialIndex;
      } else if (task && task.id) {
        const found = resolved.findIndex((q) => q.id === task.id);
        if (found !== -1) {
          startIdx = found;
        }
      }

      setActiveQueue(resolved);
      setCurrentIndex(startIdx);
      if (resolved[startIdx]) {
        setCurrentTask(resolved[startIdx]);
      } else if (task) {
        setCurrentTask(task);
      }
    } else if (!isOpen) {
      setActiveQueue([]);
      setCurrentIndex(0);
      setCurrentTask(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, queueProp, initialIndex, task, callLogs]);

  // Read active channel with fallback to 'Phone Call'
  const initialTaskChannel: string = currentTask?.channel || 'Phone Call';
  const [currentChannel, setCurrentChannel] = useState<string>(initialTaskChannel);

  // Dynamically get available statuses based on channel from activityLogic
  const availableStatuses = useMemo(() => {
    return getStatusesForChannel(currentChannel).filter(s => s !== 'Scheduled' && s !== 'Scheduled / Planned');
  }, [currentChannel]);

  const availablePurposes = useMemo(() => {
    let list: string[] = [];
    if (callPurposes && callPurposes.length > 0) {
      list = Array.from(new Set([
        ...SYSTEM_CALL_PURPOSES,
        ...callPurposes.map(p => p.name === 'Inbound Enquiry' ? 'Inbound' : p.name)
      ]));
    } else {
      list = [...SYSTEM_CALL_PURPOSES];
    }
    // Always place fallback 'General / Other' at the bottom of the list
    if (list.includes('General / Other')) {
      list = list.filter(p => p !== 'General / Other');
      list.push('General / Other');
    }
    return list;
  }, [callPurposes]);

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
  const [followUpChannel, setFollowUpChannel] = useState<MasterActivityChannel>('Phone Call');
  const [activePreset, setActivePreset] = useState<'laterToday' | 'thisAfternoon' | 'tomorrow' | '3days' | '1week' | 'custom' | null>('tomorrow');
  const [nextFollowUpDate, setNextFollowUpDate] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Dedicated Task Lifecycle Action States (Mutually Exclusive Drawer)
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'cancel' | 'reschedule'>('none');
  const [reschedulePreset, setReschedulePreset] = useState<'tomorrow' | '3days' | '1week' | 'custom'>('tomorrow');
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleReason, setRescheduleReason] = useState<string>('');

  const [cancelReason, setCancelReason] = useState<string>('');

  // Complete Task Direct Action & Scratchpad Focus State
  const [isCompletionMode, setIsCompletionMode] = useState<boolean>(false);

  // Dynamic Contact details override (for Add Contact binding & contact selector)
  const [activeContactId, setActiveContactId] = useState<string>('');
  const [activeContactName, setActiveContactName] = useState<string>('');
  const [activeContactPhone, setActiveContactPhone] = useState<string>('');
  const [activeContactEmail, setActiveContactEmail] = useState<string>('');
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  // Active Target Selection: 'contact' | 'mainline' (auto-detected from task payload, with user override capability)
  const [activeTargetOverride, setActiveTargetOverride] = useState<'contact' | 'mainline' | null>(null);

  // Expandable state for Linked Enquiry line items preview
  const [isLinkedEnquiryExpanded, setIsLinkedEnquiryExpanded] = useState<boolean>(false);

  // Ref for notes textarea
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const timeoutsRef = useRef<Set<any>>(new Set());

  const safeSetTimeout = (callback: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timeoutsRef.current.delete(timer);
      callback();
    }, ms);
    timeoutsRef.current.add(timer);
    return timer;
  };

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current.clear();
    };
  }, []);

  // Modals integration state
  const [isContactModalOpen, setIsContactModalOpen] = useState<boolean>(false);
  const [isCompany360Open, setIsCompany360Open] = useState<boolean>(false);
  const [selectedHistoryLog, setSelectedHistoryLog] = useState<CallLogEntry | null>(null);

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
      setIsCompletionMode(false);
      const taskChan = currentTask.channel || 'Phone Call';
      setCurrentChannel(taskChan);

      const isCall = taskChan === 'Call' || taskChan === 'Phone Call';
      const validStatusesForDefault = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(taskChan);
      const defaultStatus = validStatusesForDefault.find((s) => isSuccessStatus(s)) || validStatusesForDefault[0] || 'Completed / Connected';
      
      const rawPurpose = currentTask.purpose;
      const normalizedPurpose = rawPurpose === 'Discovery / Validation'
        ? 'Discovery / Qualification'
        : (rawPurpose === 'Inbound Enquiry' ? 'Inbound' : (rawPurpose || availablePurposes[0] || 'Discovery / Qualification'));
      setPurpose(normalizedPurpose);

      // Initialize disposition based on existing task state and channel
      const chanDisps = getDispositionsForChannel(taskChan);
      const matchedDisp = chanDisps.find((d) => {
        if (currentTask.status === d.status) return true;
        if (currentTask.outcome && d.defaultOutcome === currentTask.outcome) return true;
        return false;
      }) || chanDisps[0];

      if (currentTask.status === 'Invalid Number' && chanDisps.some(d => d.id === 'invalid_number')) {
        setActiveDispositionId('invalid_number');
        setCallStatus('Invalid Number');
        setCallOutcome('Wrong Person / Unqualified');
        setNextFollowUpDate('');
        setActivePreset(null);
      } else if (currentTask.status === 'No Answer' && chanDisps.some(d => d.id === 'no_answer')) {
        setActiveDispositionId('no_answer');
        setCallStatus('No Answer');
        setCallOutcome(currentTask.outcome || 'No Response / Ghosted');
      } else if (currentTask.status === 'Busy' && chanDisps.some(d => d.id === 'gatekeeper_busy')) {
        setActiveDispositionId('gatekeeper_busy');
        setCallStatus('Busy');
        setCallOutcome(currentTask.outcome || 'Gatekeeper Blocked');
      } else if (currentTask.outcome === 'Follow-up Scheduled' || currentTask.followup_intent) {
        const followupDisp = chanDisps.find(d => d.id.includes('followup')) || matchedDisp;
        setActiveDispositionId(followupDisp.id);
        setCallStatus(defaultStatus);
        setCallOutcome('Follow-up Scheduled');
      } else {
        setActiveDispositionId(matchedDisp.id);
        setCallStatus(matchedDisp.status || defaultStatus);
        setCallOutcome(currentTask.outcome || matchedDisp.defaultOutcome);
      }

      setIsDnc(Boolean(currentTask.is_dnc || currentTask.dnc));
      setNotes(currentTask.requirement_notes || currentTask.notes || '');
      setFollowUpIntent(currentTask.followup_intent || '');
      setFollowUpChannel(normalizeModalFollowUpChannel(taskChan));

      // Default next follow-up date to tomorrow at 10:00 AM (if not already set)
      if (currentTask.next_followup_date) {
        setNextFollowUpDate(String(currentTask.next_followup_date).replace(' ', 'T').slice(0, 16));
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

      // Initialize contact details with robust auto-binding
      const explicitContactId = currentTask.contact_id || (currentTask as any).contactId || (currentTask as any).contact_person_id || '';
      const explicitContactName = (currentTask.contact_name || (currentTask as any).contactPerson || (currentTask as any).contact_person || (currentTask as any).contactName || '').trim();

      const compId = currentTask.company_id || (currentTask as any).companyId || '';
      const compName = (currentTask.company_name || (currentTask as any).companyName || '').trim().toLowerCase();

      // Find available contacts for this company
      const availableCompContacts = (contacts || []).filter((c) => {
        if (c.is_deleted) return false;
        if (compId && (c.company_id === compId || (c as any).companyId === compId)) return true;
        if (compName && (c as any).company_name && (c as any).company_name.trim().toLowerCase() === compName) return true;
        return false;
      });

      let matchedContact: Contact | null = null;
      if (explicitContactId) {
        matchedContact = (contacts || []).find((c) => c.id === explicitContactId) || null;
      }
      if (!matchedContact && explicitContactName && explicitContactName.toLowerCase() !== 'no contact person' && explicitContactName.toLowerCase() !== 'company mainline' && explicitContactName.toLowerCase() !== 'unassigned') {
        matchedContact = availableCompContacts.find((c) => (c.full_name || (c as any).name || '').trim().toLowerCase() === explicitContactName.toLowerCase()) ||
          (contacts || []).find((c) => (c.full_name || (c as any).name || '').trim().toLowerCase() === explicitContactName.toLowerCase()) || null;
      }
      // If task has no explicit contact attached but the company has contacts, auto-select first primary contact immediately on mount
      if (!matchedContact && availableCompContacts.length > 0) {
        const primary = availableCompContacts.find((c) => c.is_primary || (c as any).isPrimary) || availableCompContacts[0];
        matchedContact = primary || null;
      }

      if (matchedContact) {
        setActiveContactId(matchedContact.id || '');
        setActiveContactName(matchedContact.full_name || '');
        const phones = getContactPhones(matchedContact);
        const contactPrimaryPhone = phones[0]?.value || matchedContact.mobile || matchedContact.phone || matchedContact.landline || '';
        const resolvedPhone = currentTask.contact_phone || currentTask.phone_number || currentTask.phone || contactPrimaryPhone || '';
        setActiveContactPhone(resolvedPhone);
        const emails = getContactEmails(matchedContact);
        const contactPrimaryEmail = emails[0]?.value || matchedContact.email || '';
        const resolvedEmail = (currentTask as any)?.contact_email || (currentTask as any)?.target_email || currentTask?.email_address || currentTask?.email || contactPrimaryEmail || '';
        setActiveContactEmail(resolvedEmail);
        setActiveTargetOverride('contact');
      } else {
        setActiveContactId(explicitContactId || '');
        setActiveContactName(explicitContactName || '');
        setActiveContactPhone(currentTask.contact_phone || currentTask.phone_number || currentTask.phone || currentTask.unlinked_contact_info || '');
        setActiveContactEmail(
          (currentTask as any)?.contact_email ||
          (currentTask as any)?.target_email ||
          currentTask?.email_address ||
          currentTask?.email ||
          ''
        );
        setActiveTargetOverride(null);
      }
      setCopiedEmail(false);
      setIsLinkedEnquiryExpanded(false);

      // Reset Task Lifecycle Action panels and inputs
      setActiveDrawer('none');
      setRescheduleReason('');
      setCancelReason('');

      // Initialize default reschedule date to tomorrow 10:00 AM
      const reschedTomorrow = new Date();
      reschedTomorrow.setDate(reschedTomorrow.getDate() + 1);
      reschedTomorrow.setHours(10, 0, 0, 0);
      const reschedOffset = reschedTomorrow.getTimezoneOffset() * 60000;
      const reschedIso = new Date(reschedTomorrow.getTime() - reschedOffset).toISOString().slice(0, 16);
      setRescheduleDate(reschedIso);
      setReschedulePreset('tomorrow');

      // Auto-focus notes textarea on lead load
      safeSetTimeout(() => {
        if (notesTextareaRef.current) {
          notesTextareaRef.current.focus();
        }
      }, 150);
    }
  }, [currentTask, isOpen, callStatuses, contacts, companies]);

  // Update outcomes when status changes
  useEffect(() => {
    if (isOpen) {
      const normChan = currentChannel.toLowerCase();
      const isAsyncChannel = normChan.includes('email') || normChan.includes('message') || normChan.includes('whatsapp') || normChan.includes('sms');
      const isSentStatus = callStatus.toLowerCase().includes('sent') || callStatus.toLowerCase().includes('delivered');

      if (isAsyncChannel && isSentStatus && callOutcome !== 'Message Sent / Awaiting Reply') {
        setCallOutcome('Message Sent / Awaiting Reply');
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

  // Derive remaining unvisited leads in queue strictly forward
  const pendingLeads = useMemo(() => {
    if (!activeQueue || activeQueue.length <= 1) return [];
    return activeQueue.slice(currentIndex + 1);
  }, [activeQueue, currentIndex]);

  // Linear advancement helper: cleanly resets state and advances strictly to (currentIndex + 1)
  // Never decrements, never loops backward, cleanly exits if queue reaches the end
  const advanceToNextTask = () => {
    // Reset active drawer and temporary action drawer states
    setActiveDrawer('none');
    setRescheduleReason('');
    setCancelReason('');
    setIsCompletionMode(false);

    // Reset interaction scratchpad and follow-up states so new task has clean defaults
    setNotes('');
    setFollowUpIntent('');
    setNextFollowUpDate('');
    setActivePreset(null);

    const nextIndex = currentIndex + 1;
    if (nextIndex < activeQueue.length) {
      setCurrentIndex(nextIndex);
      const nextTask = activeQueue[nextIndex];
      setCurrentTask(nextTask);
      if (onSwitchTask) {
        onSwitchTask(nextTask);
      }
    } else {
      // Reached the end of queue - cleanly exit
      setCurrentIndex(nextIndex);
      setCurrentTask(null);
      if (onSwitchTask) {
        onSwitchTask(null);
      }
      onClose();
    }
  };

  // Linked Company entity
  const linkedCompany = useMemo(() => {
    if (!currentTask?.company_id || !companies) return null;
    return companies.find((c) => c.id === currentTask.company_id) || null;
  }, [currentTask, companies]);

  // Auto-bind contact if modal is open with active task and contacts arrive asynchronously
  useEffect(() => {
    if (!isOpen || !currentTask) return;
    if (activeContactId) return; // already bound
    if (activeTargetOverride === 'mainline') return; // user explicitly picked mainline

    const compId = currentTask.company_id || (currentTask as any).companyId || linkedCompany?.id;
    const compName = (currentTask.company_name || (currentTask as any).companyName || linkedCompany?.display_name || '').trim().toLowerCase();

    const availableCompContacts = (contacts || []).filter((c) => {
      if (c.is_deleted) return false;
      if (compId && (c.company_id === compId || (c as any).companyId === compId)) return true;
      if (compName && (c as any).company_name && (c as any).company_name.trim().toLowerCase() === compName) return true;
      return false;
    });

    if (availableCompContacts.length === 0) return;

    // Check if task has an explicit contact id or name
    const explicitContactId = currentTask.contact_id || (currentTask as any).contactId;
    const explicitContactName = (currentTask.contact_name || (currentTask as any).contactPerson || (currentTask as any).contact_person || (currentTask as any).contactName || '').trim();

    let matched: Contact | null = null;
    if (explicitContactId) {
      matched = (contacts || []).find((c) => c.id === explicitContactId) || null;
    }
    if (!matched && explicitContactName && explicitContactName.toLowerCase() !== 'no contact person' && explicitContactName.toLowerCase() !== 'company mainline' && explicitContactName.toLowerCase() !== 'unassigned') {
      matched = availableCompContacts.find((c) => (c.full_name || (c as any).name || '').trim().toLowerCase() === explicitContactName.toLowerCase()) ||
        (contacts || []).find((c) => (c.full_name || (c as any).name || '').trim().toLowerCase() === explicitContactName.toLowerCase()) || null;
    }
    if (!matched && availableCompContacts.length > 0) {
      matched = availableCompContacts.find((c) => c.is_primary || (c as any).isPrimary) || availableCompContacts[0];
    }

    if (matched) {
      setActiveContactId(matched.id || '');
      setActiveContactName(matched.full_name || '');
      const phones = getContactPhones(matched);
      const contactPrimaryPhone = phones[0]?.value || matched.mobile || matched.phone || matched.landline || '';
      if (!activeContactPhone) {
        const resolvedPhone = currentTask.contact_phone || currentTask.phone_number || currentTask.phone || contactPrimaryPhone || '';
        setActiveContactPhone(resolvedPhone);
      }
      const emails = getContactEmails(matched);
      const contactPrimaryEmail = emails[0]?.value || matched.email || '';
      if (!activeContactEmail) {
        const resolvedEmail = (currentTask as any)?.contact_email || (currentTask as any)?.target_email || currentTask?.email_address || currentTask?.email || contactPrimaryEmail || '';
        setActiveContactEmail(resolvedEmail);
      }
      setActiveTargetOverride('contact');
    }
  }, [isOpen, currentTask, contacts, linkedCompany, activeContactId, activeTargetOverride, activeContactPhone, activeContactEmail]);

  // Company Mainline Phone resolution
  const companyMainPhone = useMemo(() => {
    if (!linkedCompany) return currentTask?.company_phone || '';
    const phoneList = getCompanyPhones(linkedCompany);
    if (phoneList && phoneList.length > 0 && phoneList[0].value) {
      return phoneList[0].value;
    }
    return linkedCompany.general_phone || linkedCompany.phone || currentTask?.company_phone || '';
  }, [linkedCompany, currentTask]);

  // Company Mainline Email resolution
  const companyMainEmail = useMemo(() => {
    if (!linkedCompany) return currentTask?.company_email || currentTask?.email_address || '';
    const emailList = getCompanyEmails(linkedCompany);
    if (emailList && emailList.length > 0 && emailList[0].value) {
      return emailList[0].value;
    }
    return linkedCompany.general_email || linkedCompany.email || currentTask?.company_email || '';
  }, [linkedCompany, currentTask]);

  // Target Contact Person resolution
  const targetContact = useMemo(() => {
    const cId = activeContactId || currentTask?.contact_id || (currentTask as any)?.contactId;
    if (cId && contacts) {
      const found = contacts.find((c) => c.id === cId);
      if (found) return found;
    }
    const cName = (activeContactName || currentTask?.contact_name || (currentTask as any)?.contactPerson || '').trim().toLowerCase();
    if (cName && cName !== 'no contact person' && cName !== 'company mainline' && contacts) {
      return contacts.find((c) => (c.full_name || '').trim().toLowerCase() === cName) || null;
    }
    return null;
  }, [activeContactId, activeContactName, currentTask, contacts]);

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

  // Direct contact email resolution
  const directEmail = useMemo(() => {
    if (activeContactEmail) return activeContactEmail;
    if (targetContact) {
      const emailList = getContactEmails(targetContact);
      if (emailList && emailList.length > 0 && emailList[0].value) {
        return emailList[0].value;
      }
      if (targetContact.email) return targetContact.email;
    }
    return (
      (currentTask as any)?.contact_email ||
      (currentTask as any)?.target_email ||
      currentTask?.email_address ||
      currentTask?.email ||
      ''
    );
  }, [activeContactEmail, targetContact, currentTask]);

  // All contacts registered under the active company
  const companyContacts = useMemo(() => {
    if (!contacts || contacts.length === 0) return [];
    const compId = currentTask?.company_id || linkedCompany?.id;
    const compName = (currentTask?.company_name || linkedCompany?.display_name || '').trim().toLowerCase();

    return contacts.filter((c) => {
      if (c.is_deleted) return false;
      if (compId && (c.company_id === compId || (c as any).companyId === compId)) return true;
      if (compName && (c as any).company_name && (c as any).company_name.trim().toLowerCase() === compName) return true;
      return false;
    });
  }, [currentTask, linkedCompany, contacts]);

  // Selectable contacts list guaranteeing the active/target contact is included
  const allSelectableContacts = useMemo(() => {
    const list = [...companyContacts];
    if (targetContact && !list.some((c) => c.id === targetContact.id)) {
      list.unshift(targetContact);
    }
    return list;
  }, [companyContacts, targetContact]);

  // Handle contact selection from dropdown
  const handleSelectContactOption = (selectedValue: string) => {
    if (selectedValue === '__mainline__') {
      setActiveTargetOverride('mainline');
      return;
    }

    if (selectedValue === '__current__') {
      setActiveTargetOverride('contact');
      return;
    }

    const selected = allSelectableContacts.find((c) => c.id === selectedValue);
    if (selected) {
      setActiveTargetOverride('contact');
      setActiveContactId(selected.id || '');
      setActiveContactName(selected.full_name || '');
      const phones = getContactPhones(selected);
      const primaryPhone = phones[0]?.value || selected.mobile || selected.phone || selected.landline || '';
      setActiveContactPhone(primaryPhone);
      const emails = getContactEmails(selected);
      const primaryEmail = emails[0]?.value || selected.email || '';
      setActiveContactEmail(primaryEmail);
    }
  };

  const handleCopyEmail = (emailToCopy: string) => {
    if (!emailToCopy) return;
    navigator.clipboard?.writeText(emailToCopy);
    setCopiedEmail(true);
    safeSetTimeout(() => {
      setCopiedEmail(false);
    }, 2000);
  };

  const companyName = currentTask?.company_name || currentTask?.unlinked_name || linkedCompany?.display_name || 'No Company Account';
  const activeCompanyId = currentTask?.company_id || (currentTask as any)?.companyId || linkedCompany?.id || '';
  const activeCompanyName =
    currentTask?.company_name ||
    (currentTask as any)?.companyName ||
    linkedCompany?.display_name ||
    linkedCompany?.name ||
    (companyName !== 'No Company Account' ? companyName : '') ||
    '';
  const displayContactName =
    activeContactName ||
    (currentTask?.contact_name && currentTask.contact_name !== 'No Contact Person' ? currentTask.contact_name : '') ||
    ((currentTask as any)?.contactPerson && (currentTask as any).contactPerson !== 'No Contact Person' ? (currentTask as any).contactPerson : '') ||
    targetContact?.full_name ||
    (allSelectableContacts.length === 0 ? 'No contacts available' : 'No Contact Person');
  const originalAgenda = currentTask?.followup_intent || currentTask?.requirement_notes || currentTask?.notes || '';

  // Active Target Auto-Detection based on task payload
  const detectedTarget = useMemo<'contact' | 'mainline'>(() => {
    if (!currentTask) return 'contact';

    const cleanDigits = (s?: string) => (s || '').replace(/\D/g, '');
    const taskTargetNumber = cleanDigits(
      (currentTask as any)?.target_number ||
      (currentTask as any)?.target_phone ||
      currentTask?.contact_phone ||
      (currentTask as any)?.phone_number ||
      ''
    );
    const cleanMain = cleanDigits(companyMainPhone);
    const cleanDirect = cleanDigits(directPhone);

    // 1. If explicit target number matches company mainline and not contact direct
    if (taskTargetNumber && cleanMain && taskTargetNumber === cleanMain && taskTargetNumber !== cleanDirect) {
      return 'mainline';
    }

    // 2. If target email matches company general email and not contact email
    const taskTargetEmail = ((currentTask as any)?.target_email || currentTask?.email_address || '').trim().toLowerCase();
    if (taskTargetEmail) {
      const compEmail = (linkedCompany?.email || (linkedCompany as any)?.general_email || '').trim().toLowerCase();
      const contEmail = (targetContact?.email || '').trim().toLowerCase();
      if (compEmail && taskTargetEmail === compEmail && taskTargetEmail !== contEmail) {
        return 'mainline';
      }
      if (contEmail && taskTargetEmail === contEmail) {
        return 'contact';
      }
    }

    // 3. If task has contact_id or resolved targetContact
    if (currentTask.contact_id || targetContact) {
      return 'contact';
    }

    // 4. If task has a contact_name indicating company mainline/switchboard
    const contactNameLower = (currentTask.contact_name || '').trim().toLowerCase();
    if (['company mainline', 'mainline', 'switchboard', 'reception', 'general line', 'office phone', 'office line'].includes(contactNameLower)) {
      return 'mainline';
    }

    // 5. If contact_name is present and distinct from generic placeholder
    if (contactNameLower && contactNameLower !== 'no contact person' && contactNameLower !== 'primary decision maker') {
      return 'contact';
    }

    // 6. If cleanTarget matches directPhone
    if (taskTargetNumber && cleanDirect && taskTargetNumber === cleanDirect) {
      return 'contact';
    }

    // 7. If company mainline phone exists and no direct phone
    if (companyMainPhone && !directPhone) {
      return 'mainline';
    }

    return 'contact';
  }, [currentTask, companyMainPhone, directPhone, linkedCompany, targetContact]);

  const activeTarget: 'contact' | 'mainline' = activeTargetOverride || detectedTarget;

  // Linked Reference Resolution
  const linkedEnquiryId =
    currentTask?.enquiry_id ||
    (currentTask as any)?.linked_enquiry_id ||
    (currentTask as any)?.enquiryId ||
    null;

  const linkedProposalRef =
    currentTask?.enquiry_quote_ref ||
    (currentTask as any)?.linked_proposal_id ||
    (currentTask as any)?.proposal_id ||
    (currentTask as any)?.quote_ref_no ||
    (currentTask as any)?.quote_no ||
    null;

  const linkedGeneralRef =
    (currentTask as any)?.reference_number ||
    (currentTask as any)?.reference_no ||
    (currentTask as any)?.ref_id ||
    (currentTask as any)?.ref_code ||
    null;

  // Resolve matching Enquiry record if available
  const resolvedLinkedEnquiry = useMemo(() => {
    if (!enquiries || enquiries.length === 0) return null;

    if (linkedEnquiryId) {
      const found = enquiries.find((e) => e.id === linkedEnquiryId);
      if (found) return found;
    }

    if (linkedProposalRef) {
      const cleanRef = linkedProposalRef.trim().toLowerCase();
      const found = enquiries.find(
        (e) =>
          e.quote_ref_no?.trim().toLowerCase() === cleanRef ||
          e.customer_reference_code?.trim().toLowerCase() === cleanRef ||
          e.id === linkedProposalRef
      );
      if (found) return found;
    }

    // Fallback: check if notes or purpose contains a quote/enquiry code pattern (e.g. #EQ-1002 or QT-2024-01)
    const textToCheck = `${currentTask?.purpose || ''} ${currentTask?.requirement_notes || ''} ${currentTask?.notes || ''}`;
    const codeMatch = textToCheck.match(/(?:#|\b)(?:EQ|ENQ|QT|PROP|PRP)[-_ ]?(\d+)/i);
    if (codeMatch) {
      const matchedNum = codeMatch[1];
      const found = enquiries.find((e) => {
        if (e.sn && String(e.sn) === matchedNum) return true;
        if (e.quote_ref_no && e.quote_ref_no.includes(matchedNum)) return true;
        return false;
      });
      if (found) return found;
    }

    return null;
  }, [enquiries, linkedEnquiryId, linkedProposalRef, currentTask]);

  const canonicalEnquiryRef = useMemo(() => {
    if (resolvedLinkedEnquiry) {
      if (resolvedLinkedEnquiry.quote_ref_no) {
        return resolvedLinkedEnquiry.quote_ref_no.startsWith('#')
          ? resolvedLinkedEnquiry.quote_ref_no
          : `#${resolvedLinkedEnquiry.quote_ref_no}`;
      }
      return getReferenceId('EQ', resolvedLinkedEnquiry, enquiries);
    }
    if (linkedProposalRef) {
      return linkedProposalRef.startsWith('#') ? linkedProposalRef : `#${linkedProposalRef}`;
    }
    if (linkedGeneralRef) {
      return linkedGeneralRef.startsWith('#') ? linkedGeneralRef : `#${linkedGeneralRef}`;
    }
    if (linkedEnquiryId) {
      return `#ENQ-${linkedEnquiryId}`;
    }
    return '';
  }, [resolvedLinkedEnquiry, enquiries, linkedProposalRef, linkedGeneralRef, linkedEnquiryId]);

  const hasLinkedRecord = Boolean(canonicalEnquiryRef || resolvedLinkedEnquiry);

  // Company address resolution for site visits and geographic context
  const companyAddress = useMemo(() => {
    const parts: string[] = [];
    if ((linkedCompany as any)?.address) parts.push((linkedCompany as any).address);
    if (linkedCompany?.city) parts.push(linkedCompany.city);
    if (linkedCompany?.country) parts.push(linkedCompany.country);
    if (parts.length > 0) return parts.join(', ');
    if (currentTask?.location_or_link && !currentTask.location_or_link.startsWith('http')) {
      return currentTask.location_or_link;
    }
    if ((currentTask as any)?.geography) return (currentTask as any).geography;
    return '';
  }, [linkedCompany, currentTask]);

  // Meeting URL / Link resolution for virtual meetings
  const meetingLink = useMemo(() => {
    const raw =
      (currentTask as any)?.meeting_url ||
      (currentTask as any)?.video_link ||
      (currentTask as any)?.meeting_link ||
      (currentTask as any)?.zoom_link ||
      (currentTask as any)?.teams_link ||
      (currentTask as any)?.google_meet_link ||
      currentTask?.location_or_link ||
      '';
    if (!raw) return '';
    const trimmed = String(raw).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
    if (
      trimmed.includes('meet.google') ||
      trimmed.includes('zoom.us') ||
      trimmed.includes('teams.microsoft') ||
      trimmed.includes('webex.com')
    ) {
      return `https://${trimmed}`;
    }
    return '';
  }, [currentTask]);

  // Contextual dispositions based on active interaction channel
  const activeDispositions = useMemo(() => getDispositionsForChannel(currentChannel), [currentChannel]);

  const activeChannel = currentChannel;
  const chNorm = (activeChannel || '').trim().toLowerCase();
  const isEmailChannel = chNorm.includes('email');
  const isMeetingChannel = chNorm.includes('meeting');
  const isSiteVisitChannel = chNorm.includes('visit') || chNorm.includes('site');
  const isInternalChannel = chNorm.includes('internal') || chNorm.includes('task') || chNorm.includes('admin');
  const isPhoneChannel = chNorm.includes('call') || chNorm.includes('phone');
  const isPhoneOrWhatsApp = !isEmailChannel && !isMeetingChannel && !isSiteVisitChannel && !isInternalChannel;
  const effectiveContactEmail = activeTarget === 'mainline' ? (companyMainEmail || directEmail) : (directEmail || companyMainEmail);
  const isCompletedState = isSuccessStatus(callStatus);
  const availableOutcomes = getOutcomesForStatus(activeChannel, callStatus);

  // Identify when modal is executing a scheduled task from the queue
  const isExecutingTask = Boolean(
    currentTask && (
      ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft', 'Rescheduled'].includes(currentTask.status as string) ||
      currentTask.next_followup_date ||
      (currentTask as any).is_task ||
      Boolean(task)
    )
  );

  const handleChannelChange = (newChan: string) => {
    setCurrentChannel(newChan);
    setFollowUpChannel(normalizeModalFollowUpChannel(newChan));
    const isCall = newChan === 'Call' || newChan === 'Phone Call';
    const newStatuses = (isCall && callStatuses?.length) ? callStatuses.map(s => s.name) : getStatusesForChannel(newChan);
    if (!newStatuses.includes(callStatus)) {
      const defaultSt = newStatuses.find((s) => isSuccessStatus(s)) || newStatuses[0] || 'Completed / Connected';
      setCallStatus(defaultSt);
      setCallOutcome('');
    }
    const nextDisps = getDispositionsForChannel(newChan);
    if (!nextDisps.some(d => d.id === activeDispositionId)) {
      if (nextDisps.length > 0) {
        handleSelectDisposition(nextDisps[0]);
      }
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

  // Helper to evaluate line safety restriction (DNC or Invalid) for specific contact or company lines
  const getLineRestriction = (rawPhoneOrEmail?: string, isMainline: boolean = false): 'DNC' | 'Invalid' | null => {
    if (!rawPhoneOrEmail) return null;
    const cleanDigits = rawPhoneOrEmail.replace(/\D/g, '');
    const cleanTrimmed = rawPhoneOrEmail.trim().toLowerCase();

    // 1. Check target contact restricted lines and DNC flags
    if (!isMainline && targetContact) {
      if (targetContact.is_dnc || targetContact.dnc) return 'DNC';
      if (targetContact.restricted_lines) {
        for (const [key, val] of Object.entries(targetContact.restricted_lines)) {
          const keyDigits = key.replace(/\D/g, '');
          const keyTrimmed = key.trim().toLowerCase();
          if (
            (cleanDigits && keyDigits && (cleanDigits === keyDigits || cleanDigits.endsWith(keyDigits) || keyDigits.endsWith(cleanDigits))) ||
            (cleanTrimmed && keyTrimmed && cleanTrimmed === keyTrimmed)
          ) {
            return (val as 'DNC' | 'Invalid') || 'DNC';
          }
        }
      }
    }

    // 2. Check linked company restricted lines and DNC flags
    if (linkedCompany) {
      if (isMainline && (linkedCompany.is_dnc || linkedCompany.dnc)) return 'DNC';
      if (linkedCompany.restricted_lines) {
        for (const [key, val] of Object.entries(linkedCompany.restricted_lines)) {
          const keyDigits = key.replace(/\D/g, '');
          const keyTrimmed = key.trim().toLowerCase();
          if (
            (cleanDigits && keyDigits && (cleanDigits === keyDigits || cleanDigits.endsWith(keyDigits) || keyDigits.endsWith(cleanDigits))) ||
            (cleanTrimmed && keyTrimmed && cleanTrimmed === keyTrimmed)
          ) {
            return (val as 'DNC' | 'Invalid') || 'DNC';
          }
        }
      }
    }

    return null;
  };

  // 1-Click Disposition Matrix Selection
  const handleSelectDisposition = (disp: DispositionConfig) => {
    setActiveDispositionId(disp.id);
    setCallStatus(disp.status);
    setCallOutcome(disp.defaultOutcome);

    // Auto-select follow-up channel if disposition indicates info requested or channel-specific follow-up
    const dispText = `${disp.id} ${disp.label} ${disp.defaultOutcome} ${disp.defaultIntent || ''}`.toLowerCase();
    if (dispText.includes('whatsapp') || dispText.includes('wa')) {
      setFollowUpChannel('Message (WhatsApp/SMS)');
    } else if (dispText.includes('email')) {
      setFollowUpChannel('Email');
    } else if (dispText.includes('quote') || dispText.includes('proposal') || dispText.includes('info')) {
      // Default to WhatsApp if active target has phone, or WhatsApp/SMS channel
      setFollowUpChannel('Message (WhatsApp/SMS)');
    }

    if (disp.id === 'call_dropped') {
      const retryDate = new Date(Date.now() + 15 * 60 * 1000);
      const offset = retryDate.getTimezoneOffset() * 60000;
      const localIso = new Date(retryDate.getTime() - offset).toISOString().slice(0, 16);
      setNextFollowUpDate(localIso);
      setActivePreset(null);
      setFollowUpIntent('Call dropped / disconnected - Retry callback');
      if (!notes.trim()) {
        setNotes('Call dropped / disconnected mid-conversation. Follow-up retry scheduled for 15 minutes.');
      }
    } else if (disp.id === 'scheduled') {
      if (disp.defaultPreset) {
        applyFollowUpPreset(disp.defaultPreset, disp.defaultIntent);
      }
      setTimeout(() => {
        const input = document.getElementById('next-followup-datetime') as HTMLInputElement | null;
        if (input) {
          input.focus();
          if (typeof (input as any).showPicker === 'function') {
            try { (input as any).showPicker(); } catch {}
          }
        }
      }, 50);
    } else if (disp.defaultPreset === 'clear') {
      setNextFollowUpDate('');
      setActivePreset(null);
      setFollowUpIntent('');
    } else if (disp.defaultPreset) {
      applyFollowUpPreset(disp.defaultPreset, disp.defaultIntent);
    }
  };

  // Quick Follow-Up Preset Calculation
  const applyFollowUpPreset = (preset: 'laterToday' | 'thisAfternoon' | 'tomorrow' | '3days' | '1week' | 'custom' | 'clear', customIntent?: string) => {
    if (preset === 'clear') {
      setNextFollowUpDate('');
      setActivePreset(null);
      if (customIntent !== undefined) {
        setFollowUpIntent(customIntent);
      }
      return;
    }

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

    let targetDate = new Date();
    if (preset === 'laterToday') {
      targetDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    } else if (preset === 'thisAfternoon') {
      const current = new Date();
      targetDate = new Date();
      targetDate.setHours(16, 0, 0, 0);
      if (current.getTime() >= targetDate.getTime()) {
        // If current time is already past 16:00, snap to tomorrow at 10:00 AM
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(10, 0, 0, 0);
      }
    } else if (preset === 'tomorrow') {
      targetDate.setDate(targetDate.getDate() + 1);
      targetDate.setHours(10, 0, 0, 0);
    } else if (preset === '3days') {
      targetDate.setDate(targetDate.getDate() + 3);
      targetDate.setHours(10, 0, 0, 0);
    } else if (preset === '1week') {
      targetDate.setDate(targetDate.getDate() + 7);
      targetDate.setHours(10, 0, 0, 0);
    }

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
      safeSetTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      setNotes((prev) => (prev ? `${prev}\n${timestampTag}` : timestampTag));
    }
  };

  // Skip / Pass Action (Muted ghost button) - strictly advances forward
  const handleSkipLead = () => {
    advanceToNextTask();
  };

  // Refined [✓ Complete Task] Action:
  // 1st click: Focuses scratchpad with subtle indicator so operator can enter final details
  // 2nd click: Commits status, archives task, and strictly advances queue
  const handleCompleteTaskClick = () => {
    if (!isCompletionMode) {
      setIsCompletionMode(true);

      // Focus the Live Notes Scratchpad textarea so the user can quickly append final details
      safeSetTimeout(() => {
        if (notesTextareaRef.current) {
          notesTextareaRef.current.focus();
          const len = notesTextareaRef.current.value.length;
          notesTextareaRef.current.setSelectionRange(len, len);
          notesTextareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 50);
    } else {
      // Second click: cleanly complete task and advance forward
      executeSubmission(true, true);
    }
  };

  // Immediate "Log Call & Message via WhatsApp" Pivot Handler
  const handlePivotToWhatsApp = async () => {
    if (isSubmitting || !currentTask) return;
    await executeSubmission(false, true, true);
  };

  // Dedicated Post-Interaction Completion Handler (Save & Close, Save & Next Lead, Explicit Complete Task, or WhatsApp Pivot)
  const executeSubmission = async (
    advanceToNext: boolean,
    forceCompleted: boolean = false,
    pivotToWhatsApp: boolean = false
  ) => {
    if (!currentTask || isSubmitting) return;
    const taskId = currentTask.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Explicitly guarantee no lingering drawer or reschedule state leaks into completion payload
    setActiveDrawer('none');
    setRescheduleReason('');
    setCancelReason('');

    // Default outcome safeguard for completed tasks across channels
    let finalOutcome = callOutcome;
    if (!finalOutcome && activeDispositionId) {
      const activeDispObj = activeDispositions.find((d) => d.id === activeDispositionId);
      finalOutcome = activeDispObj?.defaultOutcome || 'Information Gathered';
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const userUid = user?.uid || 'system_op';
      const userName = user?.full_name || user?.username || user?.email || 'Operator';

      // Flexible dropped calls & status normalization:
      // If the user selects 'Call Dropped' (or outcome is Call Dropped / Disconnected) but clears the follow-up date,
      // save the task status as 'Completed' with outcome 'Call Dropped / Disconnected' and do not generate a follow-up task.
      const isCallDropped = activeDispositionId === 'call_dropped' || callOutcome === 'Call Dropped / Disconnected';
      const isDateCleared = !nextFollowUpDate || nextFollowUpDate.trim() === '';

      let updatedStatus: string;
      if (isCallDropped && isDateCleared) {
        updatedStatus = 'Completed';
        finalOutcome = 'Call Dropped / Disconnected';
      } else {
        const isScheduledStatus = ['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(callStatus);
        updatedStatus = isScheduledStatus
          ? 'Completed'
          : (callStatus || 'Completed');
      }
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

      // Resolve target contact details based on whether contact person or company mainline is selected
      const isTargetMainline = activeTarget === 'mainline';
      let resolvedTargetContactId = isTargetMainline ? undefined : (activeContactId || currentTask.contact_id || undefined);
      let resolvedTargetContactName = isTargetMainline ? 'Company Mainline' : (activeContactName || currentTask.contact_name || displayContactName);
      let resolvedTargetContactPhone = isTargetMainline
        ? (companyMainPhone || currentTask.company_phone || '')
        : (activeContactPhone || directPhone || currentTask.contact_phone || '');
      let resolvedTargetContactEmail = isTargetMainline
        ? (companyMainEmail || currentTask.company_email || currentTask.email_address || '')
        : (activeContactEmail || directEmail || (currentTask as any)?.contact_email || currentTask?.email_address || '');
      let resolvedContactDesignation: string | undefined = undefined;

      // Auto-resolve contact person from matched phone number if contact is unassigned or mainline
      if (isContactUnassigned(resolvedTargetContactId, resolvedTargetContactName) && resolvedTargetContactPhone) {
        const autoMatch = resolveContactByPhoneNumber(
          resolvedTargetContactPhone,
          contacts,
          currentTask.company_id
        );
        if (autoMatch) {
          resolvedTargetContactId = autoMatch.contact_id;
          resolvedTargetContactName = autoMatch.contact_name;
          resolvedTargetContactPhone = autoMatch.contact_phone;
          resolvedContactDesignation = autoMatch.contact_designation;
          if (!resolvedTargetContactEmail && autoMatch.contact_email) {
            resolvedTargetContactEmail = autoMatch.contact_email;
          }
        }
      }

      // Geography / Region inheritance from company snapshot
      const resolvedGeography = resolveGeographyFromCompany(
        linkedCompany,
        activeWorkspace,
        currentTask.geography || (currentTask as any)?.geography
      );

      // Step 1: Update the CURRENT task's database record
      const updatedTaskRecord: CallLogEntry = {
        ...currentTask,
        id: taskId,
        channel: (pivotToWhatsApp ? 'Message' : currentChannel) as ActivityChannel,
        contact_id: resolvedTargetContactId,
        contact_name: resolvedTargetContactName,
        contact_phone: resolvedTargetContactPhone,
        ...((resolvedTargetContactEmail ? { contact_email: resolvedTargetContactEmail, target_email: resolvedTargetContactEmail } : {}) as any),
        geography: resolvedGeography,
        ...(resolvedContactDesignation ? { contact_designation: resolvedContactDesignation, designation: resolvedContactDesignation } : {}),
        status: (pivotToWhatsApp ? 'Completed' : updatedStatus) as CallStatus,
        outcome: pivotToWhatsApp ? (finalOutcome || 'Message Sent / Awaiting Reply') : finalOutcome,
        purpose: purpose || currentTask.purpose || 'Follow-up / Check-in',
        requirement_notes: finalNotes,
        date: nowIso,
        updatedAt: nowIso,
        last_modified_by_uid: userUid,
        last_modified_by_name: userName,
        completed_at: nowIso,
        completedAt: nowIso,
        executed_at: nowIso,
        is_task: false,
        enquiry_id: currentTask.enquiry_id || (currentTask as any)?.linked_enquiry_id || resolvedLinkedEnquiry?.id || undefined,
        enquiry_quote_ref: currentTask.enquiry_quote_ref || (currentTask as any)?.linked_proposal_id || (currentTask as any)?.quote_ref_no || canonicalEnquiryRef || undefined,
        ...(nextFollowUpDate ? { next_followup_date: nextFollowUpDate } : {})
      };

      // Step 2: Spawn Follow-Up task if nextFollowUpDate is specified
      let spawnedFollowUpTask: CallLogEntry | undefined = undefined;
      if (nextFollowUpDate && nextFollowUpDate.trim() !== '') {
        const spawnedId = `act_${Date.now()}_fup_${Math.random().toString(36).substring(2, 7)}`;
        spawnedFollowUpTask = {
          id: spawnedId,
          workspace_id: currentTask.workspace_id || 'ws_default',
          company_id: currentTask.company_id,
          company_name: currentTask.company_name || currentTask.unlinked_name || companyName,
          contact_id: resolvedTargetContactId,
          contact_name: resolvedTargetContactName,
          contact_phone: resolvedTargetContactPhone,
          geography: resolvedGeography,
          ...(resolvedContactDesignation ? { contact_designation: resolvedContactDesignation, designation: resolvedContactDesignation } : {}),
          channel: followUpChannel || currentChannel || 'Phone Call',
          date: nextFollowUpDate,
          status: 'Scheduled' as CallStatus,
          outcome: 'Follow-Up Scheduled',
          purpose: purpose || currentTask.purpose || 'Follow-up / Check-in',
          requirement_notes: followUpIntent.trim() ? followUpIntent.trim() : (notes.trim() ? `Follow up on: ${notes.trim()}` : ''),
          followup_intent: followUpIntent.trim() || undefined,
          enquiry_id: currentTask.enquiry_id || (currentTask as any)?.linked_enquiry_id || resolvedLinkedEnquiry?.id || undefined,
          enquiry_quote_ref: currentTask.enquiry_quote_ref || (currentTask as any)?.linked_proposal_id || (currentTask as any)?.quote_ref_no || canonicalEnquiryRef || undefined,
          logged_by: userName,
          sales_person: userName,
          created_by_uid: userUid,
          created_by_name: userName,
          createdAt: nowIso,
          updatedAt: nowIso
        };
      }

      // Single atomic consolidated write path
      await CallLogRepository.logInteractionWithTask({
        interaction: updatedTaskRecord,
        followupTask: spawnedFollowUpTask || null,
        mode: 'execute'
      });

      // Synchronize in-memory company state
      if (setCompanies && currentTask.company_id) {
        const nextDate = spawnedFollowUpTask
          ? spawnedFollowUpTask.next_followup_date || spawnedFollowUpTask.date
          : null;
        const finalNext = nextDate && nextDate.trim() !== '' ? nextDate.trim() : null;

        setCompanies((prev) =>
          prev.map((c) =>
            c.id === currentTask.company_id
              ? {
                  ...c,
                  lastContactedAt: nowIso,
                  lastContactedChannel: currentChannel as any,
                  lastContactedBy: userName,
                  nextFollowUpAt: finalNext,
                  last_contacted_at: nowIso,
                  next_followup_at: finalNext,
                  updatedAt: nowIso
                }
              : c
          )
        );
      }

      // Synchronize in-memory call logs state (and mark superseded tasks)
      if (setCallLogs) {
        setCallLogs((prev) =>
          prev.map((l) => {
            if (l.id === updatedTaskRecord.id) return updatedTaskRecord;
            if (
              spawnedFollowUpTask &&
              l.company_id === currentTask.company_id &&
              l.id !== spawnedFollowUpTask.id &&
              l.id !== updatedTaskRecord.id &&
              isTaskPending(l)
            ) {
              return {
                ...l,
                status: 'superseded' as CallStatus,
                outcome: 'Superseded by new follow-up',
                updatedAt: nowIso
              };
            }
            return l;
          })
        );
      }

      // Step 3: Trigger onCompleteTask and onSuccess callbacks
      if (onCompleteTask) {
        onCompleteTask(updatedTaskRecord, advanceToNext);
      }
      if (onSuccess) {
        onSuccess(updatedTaskRecord, spawnedFollowUpTask);
      }

      // Step 4: Advance to next lead, close modal, or pivot in-place to WhatsApp
      if (pivotToWhatsApp) {
        // Immediate Pivot to WhatsApp:
        // Launch WhatsApp web/app preserving any drafted notes
        const targetPhone = resolvedTargetContactPhone || directPhone || companyMainPhone || '';
        const waUrl = getWhatsAppUrl(targetPhone, notes.trim() || undefined);
        if (waUrl) {
          window.open(waUrl, '_blank', 'noopener,noreferrer');
        }

        // Transition modal to Message (WhatsApp), reset call-specific scratchpad notes, keep same lead active
        setCurrentChannel('Message (WhatsApp/SMS)');
        setFollowUpChannel('Message (WhatsApp/SMS)');
        setNotes('');
        setCallStatus('Completed');
        setCallOutcome('Message Sent / Awaiting Reply');
        const waDisps = getDispositionsForChannel('Message (WhatsApp/SMS)');
        if (waDisps.length > 0) {
          setActiveDispositionId(waDisps[0].id);
        }
      } else if (advanceToNext) {
        advanceToNextTask();
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
      setIsCompletionMode(false);
    }
  };

  // Explicit Task Lifecycle Action: Rapid Rescheduling
  const applyReschedulePreset = (preset: 'tomorrow' | '3days' | '1week' | 'custom') => {
    setReschedulePreset(preset);
    if (preset === 'custom') {
      const input = document.getElementById('reschedule-custom-datetime') as HTMLInputElement;
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
    setRescheduleDate(localIso);
  };

  // Dedicated Reschedule Deferral Handler: strictly updates schedule date & reason without completing or mixing scratchpad notes
  const executeRescheduleTask = async () => {
    if (!currentTask || !currentTask.id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const userUid = user?.uid || 'system_op';
      const userName = user?.full_name || user?.username || user?.email || 'Operator';

      const finalRescheduleDate = rescheduleDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
      })();

      const reasonClean = rescheduleReason.trim();
      const rescheduleNoteText = reasonClean
        ? `[Rescheduled to ${finalRescheduleDate}]: ${reasonClean}`
        : `[Rescheduled to ${finalRescheduleDate}]`;

      // Keep original task notes intact, purely appending deferral reason without consuming scratchpad notes
      const existingNotes = currentTask.requirement_notes || '';
      const updatedNotes = existingNotes.trim()
        ? `${existingNotes}\n${rescheduleNoteText}`
        : rescheduleNoteText;

      const updatedTaskRecord: CallLogEntry = {
        ...currentTask,
        channel: (currentChannel as ActivityChannel) || currentTask.channel || 'Phone Call',
        date: finalRescheduleDate,
        next_followup_date: finalRescheduleDate,
        scheduled_for: finalRescheduleDate,
        status: 'Scheduled' as CallStatus,
        requirement_notes: updatedNotes,
        updatedAt: nowIso,
        rescheduled_at: nowIso,
        rescheduled_by_uid: userUid,
        rescheduled_by_name: userName,
        last_modified_by_uid: userUid,
        last_modified_by_name: userName
      };

      await safeSetDoc('activity_logs', currentTask.id, updatedTaskRecord);
      await safeSetDoc('call_logs', currentTask.id, updatedTaskRecord);
      await CallLogRepository.save(updatedTaskRecord);

      if (currentTask.company_id) {
        const finalNext = finalRescheduleDate && finalRescheduleDate.trim() !== '' ? finalRescheduleDate.trim() : null;
        await CompanyRepository.updateCompany(currentTask.company_id, {
          nextFollowUpAt: finalNext,
          next_followup_at: finalNext,
          updatedAt: nowIso
        });
        if (setCompanies) {
          setCompanies((prev) =>
            prev.map((c) =>
              c.id === currentTask.company_id
                ? { ...c, nextFollowUpAt: finalNext, next_followup_at: finalNext, updatedAt: nowIso }
                : c
            )
          );
        }
      }

      if (onRescheduleTask) {
        onRescheduleTask(updatedTaskRecord, finalRescheduleDate, rescheduleReason);
      }
      if (onSuccess) {
        onSuccess(updatedTaskRecord);
      }

      // Reset drawer & reason before advancing
      setActiveDrawer('none');
      setRescheduleReason('');

      // Advance to next lead in queue strictly or close
      advanceToNextTask();
    } catch (err) {
      console.error('Failed to reschedule task:', err);
      alert('Error rescheduling task. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Explicit Task Lifecycle Action: Cancellation
  const executeCancelTask = async () => {
    if (!currentTask || !currentTask.id || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const userUid = user?.uid || 'system_op';
      const userName = user?.full_name || user?.username || user?.email || 'Operator';

      const reasonText = cancelReason.trim() || 'Operator cancelled task';
      const cancellationLogText = `[Cancelled]: ${reasonText}`;

      const combinedNotes = notes.trim()
        ? currentTask.requirement_notes
          ? `${currentTask.requirement_notes}\n${cancellationLogText}\n[Notes]: ${notes.trim()}`
          : `${cancellationLogText}\n[Notes]: ${notes.trim()}`
        : currentTask.requirement_notes
          ? `${currentTask.requirement_notes}\n${cancellationLogText}`
          : cancellationLogText;

      const updatedTaskRecord: CallLogEntry = {
        ...currentTask,
        status: 'Cancelled' as CallStatus,
        cancelled_at: nowIso,
        cancelled_by_uid: userUid,
        cancelled_by_name: userName,
        cancellation_reason: reasonText,
        requirement_notes: combinedNotes,
        updatedAt: nowIso,
        last_modified_by_uid: userUid,
        last_modified_by_name: userName
      };

      await safeSetDoc('activity_logs', currentTask.id, updatedTaskRecord);
      await safeSetDoc('call_logs', currentTask.id, updatedTaskRecord);
      await CallLogRepository.save(updatedTaskRecord);

      if (currentTask.company_id) {
        await TaskService.clearCompanyNextFollowUp(currentTask.company_id);
        if (setCompanies) {
          setCompanies((prev) =>
            prev.map((c) =>
              c.id === currentTask.company_id
                ? { ...c, nextFollowUpAt: null, next_followup_at: null, updatedAt: nowIso }
                : c
            )
          );
        }
      }

      if (onCancelTask) {
        onCancelTask(updatedTaskRecord, reasonText);
      }
      if (onSuccess) {
        onSuccess(updatedTaskRecord);
      }

      setActiveDrawer('none');
      // Advance to next lead in queue strictly or close
      advanceToNextTask();
    } catch (err) {
      console.error('Failed to cancel task:', err);
      alert('Error cancelling task. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Clean empty queue or completed queue state
  if (!currentTask || (activeQueue.length > 0 && currentIndex >= activeQueue.length)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
        <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Queue Completed!</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              All scheduled tasks in the queue have been completed, rescheduled, or skipped.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Close Command Center
          </button>
        </div>
      </div>
    );
  }

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
                  {activeQueue.length > 0 ? `${currentIndex + 1} of ${activeQueue.length} In Queue` : 'Queue Lead'}
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

              {/* Dual-Track Contact Deck with Active Target Highlighting */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* a) Target Contact Person Card */}
                <div
                  className={`p-3.5 rounded-xl transition-all duration-150 flex flex-col justify-between space-y-2.5 relative overflow-hidden ${
                    activeTarget === 'contact'
                      ? 'bg-blue-50/60 dark:bg-blue-950/25 border-2 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 shadow-2xs opacity-85 hover:opacity-100 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className={`flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider ${
                        activeTarget === 'contact' ? 'text-blue-700 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        <User className="w-3.5 h-3.5" />
                        <span>Target Contact Person</span>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        {activeTarget === 'contact' ? (
                          <span
                            id="active-target-contact-badge"
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600 text-white shadow-xs ring-1 ring-blue-400/50"
                            title="The interaction log will be assigned to this contact profile"
                          >
                            <Target className="w-2.5 h-2.5" />
                            <span>Active Target</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            id="set-target-contact-btn"
                            onClick={() => setActiveTargetOverride('contact')}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900/60 transition cursor-pointer"
                            title="Switch active interaction logging target to Contact Person"
                          >
                            <Target className="w-2.5 h-2.5" />
                            <span>Set as Target</span>
                          </button>
                        )}
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
                    </div>

                    {/* Inline Contact Selector Dropdown */}
                    <div className="mt-1.5 mb-2">
                      <div className="relative">
                        <select
                          id="target-contact-selector-dropdown"
                          value={
                            activeTarget === 'mainline'
                              ? '__mainline__'
                              : (activeContactId || targetContact?.id || (displayContactName && displayContactName !== 'No Contact Person' && displayContactName !== 'No contacts available' ? '__current__' : ''))
                          }
                          onChange={(e) => handleSelectContactOption(e.target.value)}
                          className="w-full text-xs font-semibold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-lg pl-2.5 pr-8 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer appearance-none truncate"
                          title="Select Target Contact Person"
                        >
                          {allSelectableContacts.length === 0 ? (
                            <option value="" disabled>
                              No contacts available
                            </option>
                          ) : (
                            <>
                              {/* If current contact is not in allSelectableContacts list */}
                              {displayContactName &&
                                displayContactName !== 'No Contact Person' &&
                                displayContactName !== 'No contacts available' &&
                                activeTarget !== 'mainline' &&
                                !allSelectableContacts.some((c) => c.id === (activeContactId || targetContact?.id)) && (
                                  <option value={activeContactId || targetContact?.id || '__current__'}>
                                    {displayContactName} {contactDesignation ? `(${contactDesignation})` : ''}
                                  </option>
                                )}

                              {allSelectableContacts.map((c) => {
                                const desig = c.designation || (c as any).role;
                                return (
                                  <option key={c.id} value={c.id}>
                                    {c.full_name}{desig ? ` (${desig})` : ''}
                                  </option>
                                );
                              })}
                            </>
                          )}

                          {/* Fallback option for Company Mainline / Switchboard */}
                          <option value="__mainline__">
                            🏢 Company Mainline / Switchboard
                          </option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
                      </div>
                    </div>

                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {activeTarget === 'mainline'
                        ? 'Company Mainline / Switchboard'
                        : (allSelectableContacts.length === 0 && (!displayContactName || displayContactName === 'No Contact Person' || displayContactName === 'No contacts available'))
                        ? 'No contacts available'
                        : displayContactName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                      {activeTarget === 'mainline'
                        ? 'General Reception / Switchboard'
                        : (allSelectableContacts.length === 0 && (!displayContactName || displayContactName === 'No Contact Person' || displayContactName === 'No contacts available'))
                        ? 'Use Company Mainline or click + Add / Edit'
                        : contactDesignation}
                    </div>
                    {activeTarget === 'contact' ? (
                      allSelectableContacts.length === 0 ? (
                        <div className="mt-1 flex items-center space-x-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                          <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                          <span>No contacts registered under this account</span>
                        </div>
                      ) : (
                        <div className="mt-1 flex items-center space-x-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                          <Check className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                          <span>Logs interaction against this individual profile</span>
                        </div>
                      )
                    ) : (
                      <div className="mt-1 flex items-center space-x-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <Check className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Logs interaction under company mainline switchboard</span>
                      </div>
                    )}
                  </div>

                  {/* Dynamic Channel Details across all interaction channels */}
                  {isMeetingChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs truncate">
                          <div className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-800 dark:text-slate-200 truncate" title={effectiveContactEmail}>
                              {effectiveContactEmail || <span className="text-slate-400 font-normal italic">No email listed</span>}
                            </span>
                          </div>
                          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                          <div className="flex items-center gap-1.5 truncate">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-800 dark:text-slate-200 truncate" title={directPhone}>
                              {directPhone || <span className="text-slate-400 font-normal italic">No direct phone</span>}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {effectiveContactEmail ? (
                          <a
                            id="target-contact-meeting-invite-btn"
                            href={`mailto:${effectiveContactEmail}?subject=${encodeURIComponent(`Meeting Invitation: ${displayContactName} / ${companyName}`)}`}
                            onClick={() => {
                              if (activeTarget !== 'mainline') setActiveTargetOverride('contact');
                            }}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition cursor-pointer"
                            title={`Send Meeting Invite or Email to ${effectiveContactEmail}`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Send Invite / Email</span>
                          </a>
                        ) : null}

                        {directPhone ? (() => {
                          const restriction = getLineRestriction(directPhone, false);
                          if (restriction === 'DNC') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title="DNC Restricted Line">
                                <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                <span>DNC</span>
                              </span>
                            );
                          }
                          if (restriction === 'Invalid') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Invalid Phone Line">
                                <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Invalid</span>
                              </span>
                            );
                          }
                          return (
                            <a
                              id="target-contact-meeting-call-btn"
                              href={cleanTelUrl(directPhone)}
                              onClick={() => {
                                if (activeTarget !== 'mainline') setActiveTargetOverride('contact');
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                              title={`Call Direct: ${directPhone}`}
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              <span>Call Direct</span>
                            </a>
                          );
                        })() : null}

                        {meetingLink ? (
                          <a
                            id="target-contact-launch-meeting-btn"
                            href={meetingLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition cursor-pointer"
                            title={`Launch Meeting Link: ${meetingLink}`}
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Launch Meeting Link</span>
                            <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                          </a>
                        ) : null}

                        {!effectiveContactEmail && !directPhone && !meetingLink && (
                          <button
                            type="button"
                            onClick={() => setIsContactModalOpen(true)}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            + Add Contact Phone / Email
                          </button>
                        )}
                      </div>
                    </div>
                  ) : isSiteVisitChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate min-w-0">
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Site Location / Address</div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={companyAddress || companyName}>
                          {companyAddress || <span className="text-slate-400 font-normal italic">Address unlisted ({companyName})</span>}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          id="target-contact-site-maps-btn"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(companyAddress || companyName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition cursor-pointer"
                          title={`Open Google Maps for ${companyAddress || companyName}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Open Google Maps</span>
                          <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                        </a>

                        {directPhone ? (() => {
                          const restriction = getLineRestriction(directPhone, false);
                          if (restriction === 'DNC') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title="DNC Restricted Line">
                                <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                <span>DNC</span>
                              </span>
                            );
                          }
                          if (restriction === 'Invalid') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Invalid Phone Line">
                                <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Invalid</span>
                              </span>
                            );
                          }
                          return (
                            <a
                              id="target-contact-site-call-btn"
                              href={cleanTelUrl(directPhone)}
                              onClick={() => {
                                if (activeTarget !== 'mainline') setActiveTargetOverride('contact');
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                              title={`Call Contact: ${directPhone}`}
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              <span>Call Contact</span>
                            </a>
                          );
                        })() : null}
                      </div>
                    </div>
                  ) : isInternalChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 truncate">
                        <Briefcase className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <div className="truncate">
                          <div className="text-[10px] uppercase font-semibold text-slate-400">Workflow Scope</div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            Internal Task Execution
                          </div>
                        </div>
                      </div>
                      <span
                        id="internal-work-badge"
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 shrink-0"
                      >
                        <CheckCircle2 className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                        <span>Internal Work / Non-Client Outreach</span>
                      </span>
                    </div>
                  ) : isEmailChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate min-w-0">
                        <div className="text-[10px] uppercase font-semibold text-slate-400">
                          {activeTarget === 'mainline' ? 'Company Email' : 'Direct Email'}
                        </div>
                        <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={effectiveContactEmail}>
                          {effectiveContactEmail || <span className="text-slate-400 font-normal italic">No email listed</span>}
                        </div>
                      </div>

                      {effectiveContactEmail ? (
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <a
                            id="target-contact-send-email-btn"
                            href={`mailto:${effectiveContactEmail}`}
                            onClick={() => {
                              if (activeTarget !== 'mainline') setActiveTargetOverride('contact');
                            }}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition cursor-pointer"
                            title={`Send Email to ${effectiveContactEmail}`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Send Email</span>
                          </a>
                          <button
                            type="button"
                            id="target-contact-copy-email-btn"
                            onClick={() => handleCopyEmail(effectiveContactEmail)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                            title="Copy email to clipboard"
                          >
                            {copiedEmail ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsContactModalOpen(true)}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          Add Email
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate min-w-0">
                        <div className="text-[10px] uppercase font-semibold text-slate-400">
                          {directPhone && directPhone.includes('@') ? 'Direct Email' : 'Direct Number'}
                        </div>
                        <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {directPhone || <span className="text-slate-400 font-normal italic">No direct number</span>}
                        </div>
                      </div>

                      {directPhone ? (() => {
                        const restriction = getLineRestriction(directPhone, false);
                        const isDNC = restriction === 'DNC';
                        const isInvalid = restriction === 'Invalid';

                        return (
                          <div className="flex items-center space-x-1.5 shrink-0">
                            {directPhone.includes('@') ? (
                              <a
                                id="target-contact-email-button"
                                href={`mailto:${directPhone}`}
                                onClick={() => setActiveTargetOverride('contact')}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-2xs transition cursor-pointer"
                                title={`Send Email to ${displayContactName} (${directPhone})`}
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span>Email</span>
                              </a>
                            ) : (
                              <>
                                {isDNC ? (
                                  <div className="flex items-center space-x-1.5">
                                    <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title="Do Not Call: Line is registered under DNC restriction">
                                      <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                      <span>DNC Restricted</span>
                                    </span>
                                    <button
                                      type="button"
                                      disabled
                                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                                      title="Dialing disabled due to DNC restriction"
                                    >
                                      <PhoneOff className="w-3.5 h-3.5" />
                                      <span>Call</span>
                                    </button>
                                  </div>
                                ) : isInvalid ? (
                                  <div className="flex items-center space-x-1.5">
                                    <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Invalid Phone Line">
                                      <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                      <span>Invalid Number</span>
                                    </span>
                                    <button
                                      type="button"
                                      disabled
                                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                                      title="Dialing disabled for invalid number"
                                    >
                                      <PhoneOff className="w-3.5 h-3.5" />
                                      <span>Call</span>
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <a
                                      id="target-contact-call-button"
                                      href={cleanTelUrl(directPhone)}
                                      onClick={() => setActiveTargetOverride('contact')}
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
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTargetOverride('contact');
                                      }}
                                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white shadow-2xs transition cursor-pointer"
                                      title={`WhatsApp message to ${displayContactName}`}
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" />
                                      <span>WhatsApp</span>
                                    </a>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })() : (
                        <button
                          type="button"
                          onClick={() => setIsContactModalOpen(true)}
                          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        >
                          Add Phone
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* b) Company Mainline Card */}
                <div
                  className={`p-3.5 rounded-xl transition-all duration-150 flex flex-col justify-between space-y-2.5 relative overflow-hidden ${
                    activeTarget === 'mainline'
                      ? 'bg-amber-50/60 dark:bg-amber-950/25 border-2 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                      : 'bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 shadow-2xs opacity-85 hover:opacity-100 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className={`flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-wider ${
                        activeTarget === 'mainline' ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        <PhoneForwarded className="w-3.5 h-3.5 text-amber-500" />
                        <span>Company Mainline</span>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        {activeTarget === 'mainline' ? (
                          <span
                            id="active-target-mainline-badge"
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-600 text-white shadow-xs ring-1 ring-amber-400/50"
                            title="The interaction log will be assigned to Company Mainline"
                          >
                            <Target className="w-2.5 h-2.5" />
                            <span>Active Target</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            id="set-target-mainline-btn"
                            onClick={() => setActiveTargetOverride('mainline')}
                            className="inline-flex items-center space-x-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/60 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-900/60 transition cursor-pointer"
                            title="Switch active interaction logging target to Company Mainline"
                          >
                            <Target className="w-2.5 h-2.5" />
                            <span>Set as Target</span>
                          </button>
                        )}
                        <span className="text-[10px] font-medium text-slate-400">Switchboard</span>
                      </div>
                    </div>

                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {companyName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      General Reception / Office Switchboard
                    </div>
                    {activeTarget === 'mainline' && (
                      <div className="mt-1 flex items-center space-x-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <Check className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Logs interaction under company mainline switchboard</span>
                      </div>
                    )}
                  </div>

                  {/* Mainline Number / Email & Action Buttons across channels */}
                  {isMeetingChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs truncate">
                          <div className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-800 dark:text-slate-200 truncate" title={companyMainEmail}>
                              {companyMainEmail || <span className="text-slate-400 font-normal italic">No switchboard email</span>}
                            </span>
                          </div>
                          <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                          <div className="flex items-center gap-1.5 truncate">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-slate-800 dark:text-slate-200 truncate" title={companyMainPhone}>
                              {companyMainPhone || <span className="text-slate-400 font-normal italic">No switchboard phone</span>}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {companyMainEmail ? (
                          <a
                            id="company-mainline-meeting-email-btn"
                            href={`mailto:${companyMainEmail}?subject=${encodeURIComponent(`Meeting Inquiry: ${companyName}`)}`}
                            onClick={() => setActiveTargetOverride('mainline')}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition cursor-pointer"
                            title={`Send Email to Switchboard (${companyMainEmail})`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Send Email</span>
                          </a>
                        ) : null}

                        {companyMainPhone ? (() => {
                          const restriction = getLineRestriction(companyMainPhone, true);
                          if (restriction === 'DNC') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title="DNC Restricted Line">
                                <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                <span>DNC</span>
                              </span>
                            );
                          }
                          if (restriction === 'Invalid') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Invalid Switchboard Line">
                                <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Invalid</span>
                              </span>
                            );
                          }
                          return (
                            <a
                              id="company-mainline-meeting-call-btn"
                              href={cleanTelUrl(companyMainPhone)}
                              onClick={() => setActiveTargetOverride('mainline')}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-2xs transition cursor-pointer"
                              title={`Call Switchboard (${companyMainPhone})`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call Switchboard</span>
                            </a>
                          );
                        })() : null}

                        {!companyMainEmail && !companyMainPhone && (
                          <span className="text-[11px] text-slate-400">No contact info registered</span>
                        )}
                      </div>
                    </div>
                  ) : isSiteVisitChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate min-w-0">
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Headquarters / Location</div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={companyAddress || companyName}>
                          {companyAddress || <span className="text-slate-400 font-normal italic">Address unlisted ({companyName})</span>}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          id="company-mainline-site-maps-btn"
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(companyAddress || companyName)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition cursor-pointer"
                          title={`Open Maps for ${companyAddress || companyName}`}
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Open Maps</span>
                          <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                        </a>

                        {companyMainPhone ? (() => {
                          const restriction = getLineRestriction(companyMainPhone, true);
                          if (restriction === 'DNC') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title="DNC Restricted Line">
                                <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                <span>DNC</span>
                              </span>
                            );
                          }
                          if (restriction === 'Invalid') {
                            return (
                              <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Invalid Switchboard Line">
                                <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                <span>Invalid</span>
                              </span>
                            );
                          }
                          return (
                            <a
                              id="company-mainline-site-call-btn"
                              href={cleanTelUrl(companyMainPhone)}
                              onClick={() => setActiveTargetOverride('mainline')}
                              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white shadow-2xs transition cursor-pointer"
                              title={`Call Switchboard (${companyMainPhone})`}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              <span>Call</span>
                            </a>
                          );
                        })() : null}
                      </div>
                    </div>
                  ) : isInternalChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 truncate">
                        <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div className="truncate">
                          <div className="text-[10px] uppercase font-semibold text-slate-400">Account Target</div>
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {companyName}
                          </div>
                        </div>
                      </div>
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 shrink-0">
                        <span>Internal Reference Account</span>
                      </span>
                    </div>
                  ) : isEmailChannel ? (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate min-w-0">
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Switchboard Email</div>
                        <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={companyMainEmail}>
                          {companyMainEmail || <span className="text-slate-400 font-normal italic">No email listed</span>}
                        </div>
                      </div>

                      {companyMainEmail ? (
                        <div className="flex items-center space-x-1.5 shrink-0">
                          <a
                            id="company-mainline-send-email-btn"
                            href={`mailto:${companyMainEmail}`}
                            onClick={() => setActiveTargetOverride('mainline')}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs transition cursor-pointer"
                            title={`Send Email to Switchboard (${companyMainEmail})`}
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Send Email</span>
                          </a>
                          <button
                            type="button"
                            id="company-mainline-copy-email-btn"
                            onClick={() => handleCopyEmail(companyMainEmail)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 transition cursor-pointer"
                            title="Copy Switchboard Email"
                          >
                            {copiedEmail ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Not registered</span>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">
                      <div className="truncate">
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Switchboard</div>
                        <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {companyMainPhone || <span className="text-slate-400 font-normal italic">No switchboard listed</span>}
                        </div>
                      </div>

                      {companyMainPhone ? (() => {
                        const restriction = getLineRestriction(companyMainPhone, true);
                        const isDNC = restriction === 'DNC';
                        const isInvalid = restriction === 'Invalid';

                        return (
                          <div className="flex items-center space-x-1.5 shrink-0">
                            {isDNC ? (
                              <div className="flex items-center space-x-1.5">
                                <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title="Do Not Call: Switchboard is registered under DNC restriction">
                                  <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                                  <span>DNC Restricted</span>
                                </span>
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                                  title="Dialing disabled due to DNC restriction"
                                >
                                  <PhoneOff className="w-3.5 h-3.5" />
                                  <span>Call</span>
                                </button>
                              </div>
                            ) : isInvalid ? (
                              <div className="flex items-center space-x-1.5">
                                <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800" title="Invalid Switchboard Number">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span>Invalid Line</span>
                                </span>
                                <button
                                  type="button"
                                  disabled
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                                  title="Dialing disabled for invalid number"
                                >
                                  <PhoneOff className="w-3.5 h-3.5" />
                                  <span>Call</span>
                                </button>
                              </div>
                            ) : (
                              <>
                                <a
                                  id="company-mainline-call-button"
                                  href={cleanTelUrl(companyMainPhone)}
                                  onClick={() => setActiveTargetOverride('mainline')}
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
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveTargetOverride('mainline');
                                  }}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition cursor-pointer"
                                  title={`WhatsApp Switchboard (${companyMainPhone})`}
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>WhatsApp</span>
                                </a>
                              </>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-[11px] text-slate-400">Not registered</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Dedicated Linked Commercial References Card */}
              {hasLinkedRecord && (
                <div
                  id="live-execution-linked-record-card"
                  className="p-3.5 bg-gradient-to-r from-purple-50/90 via-indigo-50/50 to-purple-50/90 dark:from-purple-950/30 dark:via-indigo-950/20 dark:to-purple-950/30 rounded-xl border border-purple-200/90 dark:border-purple-800/60 shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 flex items-center justify-center shrink-0">
                        <FileCheck className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                          {resolvedLinkedEnquiry ? 'Linked Commercial Proposal' : 'Linked Record'}
                        </span>
                        <span
                          id="linked-record-badge"
                          className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-mono font-extrabold bg-purple-600 text-white shadow-2xs"
                        >
                          <Tag className="w-3 h-3 text-purple-200" />
                          <span>Linked Enquiry: {canonicalEnquiryRef}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      {resolvedLinkedEnquiry?.status && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${
                          resolvedLinkedEnquiry.status === 'Order Received'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            : resolvedLinkedEnquiry.status === 'Active'
                            ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        }`}>
                          {resolvedLinkedEnquiry.status}
                        </span>
                      )}

                      {resolvedLinkedEnquiry?.value_aed ? (
                        <span className="px-2 py-0.5 rounded-md text-xs font-mono font-extrabold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50">
                          {resolvedLinkedEnquiry.currency || 'AED'} {resolvedLinkedEnquiry.value_aed.toLocaleString()}
                        </span>
                      ) : null}

                      {resolvedLinkedEnquiry?.items && resolvedLinkedEnquiry.items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsLinkedEnquiryExpanded((prev) => !prev)}
                          className="inline-flex items-center space-x-1 text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:text-purple-900 dark:hover:text-purple-100 bg-purple-100/70 dark:bg-purple-900/50 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800 cursor-pointer transition"
                          title="Toggle line items scope"
                        >
                          <span>{resolvedLinkedEnquiry.items.length} item{resolvedLinkedEnquiry.items.length > 1 ? 's' : ''}</span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${isLinkedEnquiryExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Subject Scope */}
                  {resolvedLinkedEnquiry?.subject && (
                    <div className="text-xs text-slate-800 dark:text-slate-200 font-medium pl-8 flex items-start gap-1">
                      <span className="text-purple-700 dark:text-purple-400 font-bold shrink-0">Subject:</span>
                      <span className="truncate">{resolvedLinkedEnquiry.subject}</span>
                    </div>
                  )}

                  {/* Meta details */}
                  <div className="pl-8 flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                    {resolvedLinkedEnquiry?.customer_reference_code && (
                      <span className="font-mono">
                        Customer Ref: <strong className="text-slate-700 dark:text-slate-200">{resolvedLinkedEnquiry.customer_reference_code}</strong>
                      </span>
                    )}
                    {resolvedLinkedEnquiry?.enquiry_date && (
                      <span>
                        Date: <strong className="text-slate-700 dark:text-slate-200">{resolvedLinkedEnquiry.enquiry_date}</strong>
                      </span>
                    )}
                    {resolvedLinkedEnquiry?.project_location && (
                      <span>
                        Location: <strong className="text-slate-700 dark:text-slate-200">{resolvedLinkedEnquiry.project_location}</strong>
                      </span>
                    )}
                  </div>

                  {/* Collapsible Line Items preview */}
                  {isLinkedEnquiryExpanded && resolvedLinkedEnquiry?.items && (
                    <div className="mt-2 pl-8 pt-2 border-t border-purple-200/60 dark:border-purple-800/40 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                        Quotation Line Items Scope
                      </div>
                      <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                        {resolvedLinkedEnquiry.items.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="flex items-center justify-between text-xs p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-purple-100 dark:border-purple-900/40"
                          >
                            <span className="font-medium text-slate-800 dark:text-slate-200 truncate pr-2">
                              {item.item_name}
                            </span>
                            <div className="flex items-center space-x-2 shrink-0 font-mono text-[11px]">
                              <span className="text-slate-500">
                                {item.quantity} {item.unit}
                              </span>
                              {item.total_price > 0 && (
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                  AED {item.total_price.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Read-Only Original Agenda / Prior Notes */}
              {(originalAgenda || currentTask?.purpose) && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-700/50">
                  <div className="flex items-center justify-between space-x-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    <div className="flex items-center space-x-1.5">
                      <FileText className="w-3 h-3 text-slate-400" />
                      <span>Prior Agenda / Interaction Intent</span>
                    </div>
                    {currentTask?.purpose && (
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 text-blue-600 dark:text-blue-400 font-bold text-[10px] normal-case">
                        Purpose: {currentTask.purpose}
                      </span>
                    )}
                  </div>
                  {originalAgenda && (
                    <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {originalAgenda}
                    </p>
                  )}
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
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
                    <Activity className="w-3.5 h-3.5 text-blue-500" />
                    <span>1-Click Disposition ({activeChannel})</span>
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Pre-selects standard next-step defaults
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {activeDispositions.map((disp) => {
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

                {/* Interaction Purpose & Detailed Outcome Grid */}
                <div className={`pt-1 grid gap-2.5 ${isCompletedState && availableOutcomes.length > 0 && !activeChannel.toLowerCase().match(/email|message|whatsapp|sms/) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {/* Purpose Selector */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="live-execution-purpose-select" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Interaction Purpose
                      </label>
                      <span className="text-[10px] text-slate-400">Operational focus</span>
                    </div>
                    <select
                      id="live-execution-purpose-select"
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium transition cursor-pointer"
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

                  {/* Outcome Refinement / Fine-Tuning Dropdown */}
                  {isCompletedState && availableOutcomes.length > 0 && !activeChannel.toLowerCase().match(/email|message|whatsapp|sms/) && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="activity-outcome-select" className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                          Detailed Outcome / Result
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
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      executeSubmission(true, isCompletionMode || isExecutingTask);
                    }
                  }}
                  placeholder={
                    isCompletionMode
                      ? "Add final interaction notes (optional) and click 'Complete & Next' below (or Ctrl+Enter)..."
                      : "Type live call notes, objection notes, decision-maker feedback, or requirements gathered..."
                  }
                  className={`w-full px-3.5 py-2.5 text-xs rounded-xl border transition placeholder:text-slate-400 resize-none font-sans leading-relaxed ${
                    isCompletionMode
                      ? 'border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500'
                  }`}
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

                {/* Follow-Up Channel Selector Picker */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Follow-up via:
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Designate target interaction channel
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { channel: 'Phone Call' as MasterActivityChannel, label: 'Phone Call', icon: PhoneCall },
                        { channel: 'Message (WhatsApp/SMS)' as MasterActivityChannel, label: 'WhatsApp', icon: MessageSquare },
                        { channel: 'Email' as MasterActivityChannel, label: 'Email', icon: Mail },
                        { channel: 'Meeting (Virtual/In-Person)' as MasterActivityChannel, label: 'Meeting', icon: Users }
                      ] as const
                    ).map((item) => {
                      const isSelected = followUpChannel === item.channel;
                      const IconComp = item.icon;
                      return (
                        <button
                          key={item.channel}
                          type="button"
                          id={`followup-channel-btn-${item.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                          onClick={() => setFollowUpChannel(item.channel)}
                          className={`flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-1 ring-blue-400/40'
                              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                          }`}
                        >
                          <IconComp className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick Presets Row */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    id="preset-later-today-button"
                    onClick={() => applyFollowUpPreset('laterToday')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      activePreset === 'laterToday'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    Later Today (+2h)
                  </button>
                  <button
                    type="button"
                    id="preset-this-afternoon-button"
                    onClick={() => applyFollowUpPreset('thisAfternoon')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      activePreset === 'thisAfternoon'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    This Afternoon (4:00 PM)
                  </button>
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
                  <button
                    type="button"
                    id="preset-clear-button"
                    onClick={() => {
                      setNextFollowUpDate('');
                      setActivePreset(null);
                      setFollowUpIntent('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/60"
                  >
                    Clear Date
                  </button>
                </div>

                {/* Datetime picker + Intent Input */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="next-followup-datetime" className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Scheduled Date & Time
                      </label>
                      {nextFollowUpDate && (
                        <button
                          type="button"
                          id="clear-followup-datetime-btn"
                          onClick={() => {
                            setNextFollowUpDate('');
                            setActivePreset(null);
                            setFollowUpIntent('');
                          }}
                          className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 transition cursor-pointer flex items-center gap-0.5"
                          title="Clear scheduled date and time"
                        >
                          <X className="w-3 h-3" />
                          <span>Clear</span>
                        </button>
                      )}
                    </div>
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

            {/* Reschedule Active Task Sub-Panel */}
            {activeDrawer === 'reschedule' && (
              <div className="p-3.5 bg-amber-50/95 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-800/70 space-y-2.5 shrink-0 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <h4 className="text-xs font-bold text-amber-950 dark:text-amber-100">
                      Reschedule Active Task
                    </h4>
                    <span className="hidden sm:inline text-[10px] text-amber-700 dark:text-amber-300 font-medium">
                      Updates scheduled date and retains lead in active queue
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('none')}
                    className="p-1 rounded-md text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mr-1">Quick Select:</span>
                  <button
                    type="button"
                    onClick={() => applyReschedulePreset('tomorrow')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      reschedulePreset === 'tomorrow'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    +1 Day (Tomorrow)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyReschedulePreset('3days')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      reschedulePreset === '3days'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    +3 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyReschedulePreset('1week')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      reschedulePreset === '1week'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    +1 Week
                  </button>
                  <button
                    type="button"
                    onClick={() => applyReschedulePreset('custom')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      reschedulePreset === 'custom'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    Custom Date
                  </button>
                </div>

                {/* Reschedule Date & Note Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      New Scheduled Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      id="reschedule-custom-datetime"
                      value={rescheduleDate}
                      onChange={(e) => {
                        setRescheduleDate(e.target.value);
                        setReschedulePreset('custom');
                      }}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Reason / Follow-Up Note
                    </label>
                    <input
                      type="text"
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      placeholder="e.g. Requested callback on Thursday morning..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-amber-300 dark:border-amber-700/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition"
                    />
                  </div>
                </div>

                {/* Quick Chips for Common Reschedule Reasons */}
                <div className="flex flex-wrap gap-1 items-center pt-0.5">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Quick Reasons:</span>
                  {['Callback Requested', 'Gatekeeper Barrier', 'No Answer / Voicemail', 'In Meeting / Busy', 'Postponed Review'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRescheduleReason(r)}
                      className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100/70 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 hover:bg-amber-200/70 border border-amber-200 dark:border-amber-800 transition cursor-pointer"
                    >
                      {r}
                    </button>
                  ))}
                </div>

                {/* Confirm Action Cluster */}
                <div className="flex items-center justify-end space-x-2 pt-1 border-t border-amber-200/60 dark:border-amber-800/40">
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('none')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    id="confirm-reschedule-btn"
                    disabled={isSubmitting}
                    onClick={executeRescheduleTask}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Rescheduling...</span>
                      </>
                    ) : (
                      <>
                        <CalendarClock className="w-3.5 h-3.5" />
                        <span>Confirm Reschedule</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Cancel Scheduled Task Sub-Panel */}
            {activeDrawer === 'cancel' && (
              <div className="p-3.5 bg-rose-50/95 dark:bg-rose-950/40 border-t border-rose-200 dark:border-rose-800/70 space-y-2.5 shrink-0 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Ban className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <h4 className="text-xs font-bold text-rose-950 dark:text-rose-100">
                      Cancel Scheduled Task
                    </h4>
                    <span className="hidden sm:inline text-[10px] text-rose-700 dark:text-rose-300 font-medium">
                      Removes this task from active queue and marks status as Cancelled
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('none')}
                    className="p-1 rounded-md text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Cancellation Reason (Optional)
                  </label>
                  <input
                    type="text"
                    id="cancel-reason-input"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Lead disqualified, duplicate task, client requested not to call..."
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-rose-300 dark:border-rose-700/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition"
                  />
                  
                  {/* Quick Reason Chips */}
                  <div className="flex flex-wrap gap-1 items-center pt-0.5">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Quick Reasons:</span>
                    {['Not Interested', 'Duplicate Task', 'Number Disconnected', 'Cancelled by Client', 'Opportunity Lost'].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setCancelReason(r)}
                        className="px-2 py-0.5 rounded text-[10px] font-medium bg-rose-100/70 dark:bg-rose-900/40 text-rose-800 dark:text-rose-300 hover:bg-rose-200/70 border border-rose-200 dark:border-rose-800 transition cursor-pointer"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Action Cluster */}
                <div className="flex items-center justify-end space-x-2 pt-1 border-t border-rose-200/60 dark:border-rose-800/40">
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('none')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    Keep Task
                  </button>
                  <button
                    type="button"
                    id="confirm-cancel-task-btn"
                    disabled={isSubmitting}
                    onClick={executeCancelTask}
                    className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Cancelling...</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" />
                        <span>Confirm Cancel Task</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Dedicated Task Lifecycle Control Bar (Prominently Rendered) */}
            {isExecutingTask && (
              <div className="px-5 py-2.5 bg-slate-100/95 dark:bg-slate-800/95 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Task Lifecycle:
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {activeQueue.length > 1
                      ? `Task ${currentIndex + 1} of ${activeQueue.length} (${pendingLeads.length} remaining)`
                      : 'Active scheduled task'}
                  </span>
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  {/* ✕ Cancel Task */}
                  <button
                    type="button"
                    id="lifecycle-cancel-task-btn"
                    disabled={isSubmitting}
                    onClick={() => setActiveDrawer((prev) => (prev === 'cancel' ? 'none' : 'cancel'))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border shadow-2xs ${
                      activeDrawer === 'cancel'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'text-rose-700 dark:text-rose-400 hover:text-rose-800 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border-rose-200 dark:border-rose-900/60'
                    }`}
                    title="Cancel this scheduled task and remove it from the active queue"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Cancel Task</span>
                  </button>

                  {/* Reschedule */}
                  <button
                    type="button"
                    id="lifecycle-reschedule-task-btn"
                    disabled={isSubmitting}
                    onClick={() => setActiveDrawer((prev) => (prev === 'reschedule' ? 'none' : 'reschedule'))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border shadow-2xs ${
                      activeDrawer === 'reschedule'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'text-amber-700 dark:text-amber-300 hover:text-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-amber-200 dark:border-amber-800/60'
                    }`}
                    title="Reschedule this task for another date or time"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>Reschedule</span>
                  </button>

                  {/* 💬 Immediate Pivot: Log Call & Open WhatsApp */}
                  {isPhoneChannel && (
                    <button
                      type="button"
                      id="lifecycle-pivot-whatsapp-btn"
                      disabled={isSubmitting}
                      onClick={handlePivotToWhatsApp}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800/60 shadow-2xs"
                      title="Log this call attempt and immediately switch to WhatsApp outreach for this contact without advancing the queue"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Log & Open WhatsApp</span>
                    </button>
                  )}

                  {/* Complete Task */}
                  <button
                    type="button"
                    id="lifecycle-complete-task-btn"
                    disabled={isSubmitting}
                    onClick={handleCompleteTaskClick}
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs flex items-center space-x-1.5 ${
                      isCompletionMode
                        ? 'text-white bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/70 ring-offset-1 dark:ring-offset-slate-900 shadow-md'
                        : 'text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
                    }`}
                    title={
                      isCompletionMode
                        ? 'Click again to confirm task completion and advance'
                        : 'Pre-set completed disposition, focus scratchpad, and complete task'
                    }
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Completing...</span>
                      </>
                    ) : isCompletionMode ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Confirm & Complete</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Complete Task</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

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

              {/* Right: Pivot WhatsApp, Save & Close (Secondary) and Complete & Next / Save & Next (Primary) */}
              <div className="flex items-center space-x-2.5">
                {isPhoneChannel && (
                  <button
                    type="button"
                    id="save-and-pivot-whatsapp-button"
                    disabled={isSubmitting}
                    onClick={handlePivotToWhatsApp}
                    className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-800/60 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 transition cursor-pointer shadow-2xs flex items-center space-x-1.5 disabled:opacity-50"
                    title="Log this call and open WhatsApp message view without advancing to the next lead"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Log & Open WhatsApp</span>
                  </button>
                )}

                <button
                  type="button"
                  id="save-and-close-button"
                  disabled={isSubmitting}
                  onClick={() => executeSubmission(false, isCompletionMode || isExecutingTask)}
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
                  onClick={() => executeSubmission(true, isCompletionMode || isExecutingTask)}
                  className={`px-4.5 py-2 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer shadow-xs ${
                    isCompletionMode || isExecutingTask
                      ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/50'
                      : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Lead...</span>
                    </>
                  ) : isCompletionMode || isExecutingTask ? (
                    <>
                      <span>
                        {pendingLeads.length > 0
                          ? `Complete & Next (${pendingLeads.length} remaining)`
                          : 'Complete & Finish'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span>
                        {pendingLeads.length > 0
                          ? `Save & Next (${pendingLeads.length} remaining)`
                          : 'Save & Finish'}
                      </span>
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
              <CompanyActivityTimeline
                companyName={companyName}
                companyId={currentTask.company_id}
                historyLogs={recentHistoryLogs}
                enquiries={enquiries ? enquiries.filter((e) => e.company_id === currentTask.company_id) : []}
                isLoading={isLoadingHistory}
                compact={true}
                showHeader={true}
                onClose={() => setIsHistoryExpanded(false)}
                onOpenCompany360={() => setIsCompany360Open(true)}
                onSelectCallLog={(log) => setSelectedHistoryLog(log)}
                onInspectCallLog={(log) => setSelectedHistoryLog(log)}
                contacts={contacts}
                companies={companies}
                user={user}
                setCallLogs={setCallLogs}
                setCompanies={setCompanies}
                setContacts={setContacts}
              />
            </div>
          )}
        </div>
      </div>

      {/* Historical Activity Log Detail Modal */}
      {selectedHistoryLog && (
        <CallLogDetailModal
          entry={selectedHistoryLog}
          currentUser={user}
          companies={companies}
          setCompanies={setCompanies}
          contacts={contacts}
          enquiries={enquiries}
          callLogs={callLogs}
          onClose={() => setSelectedHistoryLog(null)}
          onOpenCompany360={(targetCompId) => {
            setSelectedHistoryLog(null);
            setIsCompany360Open(true);
          }}
          onEdit={() => {
            setSelectedHistoryLog(null);
          }}
          onDelete={(id) => {
            if (setCallLogs) {
              setCallLogs((prev) => prev.filter((l) => l.id !== id));
            }
            setSelectedHistoryLog(null);
          }}
        />
      )}

      {/* Full Contact Creation Modal */}
      {isContactModalOpen && (
        <ContactModal
          isOpen={isContactModalOpen}
          onClose={() => setIsContactModalOpen(false)}
          companyId={activeCompanyId || undefined}
          companyName={activeCompanyName || undefined}
          lockCompany={Boolean(activeCompanyId)}
          companies={companies}
          activeWorkspaceId={currentTask?.workspace_id || (currentTask as any)?.workspaceId || 'ws_default'}
          user={user || { uid: 'system_op', email: 'operator@crm.local', name: 'Operator' }}
          setContacts={setContacts}
          setCompanies={setCompanies}
          setCallLogs={setCallLogs}
          onSaved={(savedContact: Contact) => {
            if (savedContact) {
              const phones = getContactPhones(savedContact);
              const primaryPhone =
                phones[0]?.value ||
                savedContact.phone ||
                savedContact.mobile ||
                savedContact.landline ||
                '';
              const emails = getContactEmails(savedContact);
              const primaryEmail = emails[0]?.value || savedContact.email || '';

              // 1. Immediately update active contact state
              setActiveContactId(savedContact.id || '');
              setActiveContactName(savedContact.full_name || '');
              setActiveContactPhone(primaryPhone);
              setActiveContactEmail(primaryEmail);

              // 2. Immediately switch active target header to this new contact
              setActiveTargetOverride('contact');

              // 3. Update current task state to point to new contact
              setCurrentTask((prev: any) =>
                prev
                  ? {
                      ...prev,
                      contact_id: savedContact.id || prev.contact_id,
                      contactId: savedContact.id || prev.contactId,
                      contact_name: savedContact.full_name || prev.contact_name,
                      contactPerson: savedContact.full_name || prev.contactPerson,
                      contactName: savedContact.full_name || prev.contactName,
                      contact_phone: primaryPhone || prev.contact_phone,
                      phone_number: primaryPhone || prev.phone_number,
                      contact_email: primaryEmail || prev.contact_email
                    }
                  : prev
              );

              // 4. Update contacts collection state so downstream selectors immediately contain this contact
              if (setContacts) {
                setContacts((prev) => {
                  if (prev.some((c) => c.id === savedContact.id)) {
                    return prev.map((c) => (c.id === savedContact.id ? savedContact : c));
                  }
                  return [savedContact, ...prev];
                });
              }
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
