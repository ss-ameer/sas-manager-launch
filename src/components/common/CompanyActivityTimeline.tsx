import React, { useState, useMemo } from 'react';
import {
  Clock,
  Phone,
  PhoneCall,
  Mail,
  MessageSquare,
  Users,
  Building,
  User,
  ExternalLink,
  Search,
  Calendar,
  Filter,
  FileText,
  X,
  Briefcase,
  Zap,
  CalendarClock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { CallLogEntry, Contact, Company, Enquiry, Salesperson, Workspace, getCompanyPhones, isSamePhoneNumber } from '../../types';
import { canUserClickRecord, getSalespersonFullName, canAccessEnquiry, canAccessActivityDetail } from '../../utils/permissions';
import LiveExecutionModal from '../LiveExecutionModal';
import CallLogDetailModal from '../CallLogDetailModal';
import { CallLogRepository } from '../../services/repositories/CallLogRepository';

export interface CompanyActivityTimelineProps {
  historyLogs?: CallLogEntry[];
  enquiries?: Enquiry[];
  companyName?: string;
  companyId?: string;
  contacts?: Contact[];
  companies?: Company[];
  salespersons?: Salesperson[];
  isLoading?: boolean;
  onClose?: () => void;
  onSelectCallLog?: (log: CallLogEntry) => void;
  onEditCallLog?: (log: CallLogEntry) => void;
  onInspectCallLog?: (log: CallLogEntry) => void;
  onOpenActivityDrawer?: (options: any) => void;
  onSelectEnquiry?: (id: string) => void;
  onOpenCompany360?: () => void;
  onExecuteTask?: (task: CallLogEntry) => void;
  onRefreshTimeline?: () => void;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  user?: any;
  activeWorkspace?: Workspace | any;
  isBasicTier?: boolean;
  className?: string;
  showHeader?: boolean;
  compact?: boolean;
}

/**
 * Formats an activity timestamp into:
 * - relative: e.g. "3 wks ago", "2d ago", "Today · 3:45 PM"
 * - formatted: e.g. "Aug 15, 2026 · 2:30 PM" (MMM D, YYYY · h:mm A)
 */
export function formatTimelineDate(dateStr?: string): { relative: string; formatted: string } {
  if (!dateStr) return { relative: 'Unknown date', formatted: '—' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { relative: dateStr, formatted: dateStr };

    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeString = `${hours}:${minutes} ${ampm}`;

    const formatted = `${month} ${day}, ${year} · ${timeString}`;

    let relative = '';
    if (diffMs < 0) {
      relative = `${month} ${day} · ${timeString}`;
    } else if (isToday) {
      relative = `Today · ${timeString}`;
    } else if (isYesterday) {
      relative = `Yesterday · ${timeString}`;
    } else if (diffDays > 0 && diffDays < 7) {
      relative = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    } else if (diffDays >= 7 && diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      relative = `${weeks} ${weeks === 1 ? 'wk' : 'wks'} ago`;
    } else if (diffDays >= 30 && diffDays < 365) {
      const mos = Math.floor(diffDays / 30);
      relative = `${mos} ${mos === 1 ? 'mo' : 'mos'} ago`;
    } else {
      const yrs = Math.floor(diffDays / 365);
      relative = `${yrs} ${yrs === 1 ? 'yr' : 'yrs'} ago`;
    }

    return { relative, formatted };
  } catch {
    return { relative: dateStr, formatted: dateStr };
  }
}

/**
 * Formats completion timestamp for completed activity card headers into:
 * 'Completed · Today · 11:39 PM' or 'Completed · Sep 21 · 11:39 PM'
 */
export function formatCompletedTimestamp(dateStr?: string): { relative: string; formatted: string } {
  if (!dateStr) return { relative: 'Completed', formatted: '—' };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { relative: `Completed · ${dateStr}`, formatted: dateStr };

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const isSameYear = d.getFullYear() === now.getFullYear();

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeString = `${hours}:${minutes} ${ampm}`;

    const formatted = `${month} ${day}, ${year} · ${timeString}`;

    let relativeTime = '';
    if (isToday) {
      relativeTime = `Today · ${timeString}`;
    } else if (isYesterday) {
      relativeTime = `Yesterday · ${timeString}`;
    } else if (isSameYear) {
      relativeTime = `${month} ${day} · ${timeString}`;
    } else {
      relativeTime = `${month} ${day}, ${year} · ${timeString}`;
    }

    return {
      relative: relativeTime,
      formatted,
    };
  } catch {
    return { relative: 'Completed', formatted: dateStr || '—' };
  }
}

/**
 * Formats any date string (ISO timestamp e.g. "2026-08-27T10:00", YYYY-MM-DD, etc.) into:
 * `MMM D, YYYY · h:mm A` (or `MMM D, YYYY` if date only).
 */
export function formatCleanDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[m - 1]} ${d}, ${y}`;
    }

    const d = new Date(trimmed);
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

    const hasTime = trimmed.includes('T') || trimmed.includes(':');
    if (!hasTime && d.getHours() === 0 && d.getMinutes() === 0) {
      return `${month} ${day}, ${year}`;
    }

    return `${month} ${day}, ${year} · ${hours}:${minutes} ${ampm}`;
  } catch {
    return dateStr;
  }
}

/**
 * Derives uppercase 2-letter agent initials from name or email
 */
export function getAgentInitials(name?: string): string {
  if (!name || !name.trim()) return 'ST';
  const clean = name.replace(/[^\w\s]/gi, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ST';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Evaluates whether an activity log is an active pending / scheduled task.
 * Any activity with status in ['Scheduled', 'Planned', 'Draft'] MUST be pinned inside
 * the dedicated 'UPCOMING / SCHEDULED TASKS' banner at the top of the history panel
 * until completed/cancelled.
 */
export function isScheduledTask(log: CallLogEntry): boolean {
  if (log.is_deleted) return false;
  const status = (log.status || '').toLowerCase().trim();
  const outcome = (log.outcome || '').toLowerCase().trim();

  // Completed / cancelled / executed checks
  if (
    status === 'cancelled' ||
    status === 'canceled' ||
    Boolean((log as any).cancellation_reason) ||
    status.includes('completed') ||
    status.includes('conducted') ||
    status === 'sent' ||
    status.includes('sent') ||
    outcome.includes('completed') ||
    Boolean((log as any).completed_at) ||
    Boolean((log as any).completedAt) ||
    Boolean((log as any).executed_at)
  ) {
    return false;
  }

  // Any activity with status in ['Scheduled', 'Planned', 'Draft']
  const isScheduledStatus =
    status === 'scheduled' ||
    status === 'planned' ||
    status === 'draft' ||
    status.includes('scheduled') ||
    status.includes('planned') ||
    status.includes('draft') ||
    status === 'rescheduled' ||
    status === 'pending';

  const hasScheduledDate = Boolean(log.next_followup_date || (log as any).scheduled_for);
  const isTaskFlag = Boolean((log as any).is_task);

  return isScheduledStatus || (hasScheduledDate && !outcome.includes('completed')) || isTaskFlag;
}

/**
 * Returns formatted badge metadata and overdue calculation for scheduled dates
 */
export function getScheduledDueBadge(scheduledDateStr?: string): {
  label: string;
  badgeClass: string;
  isOverdue: boolean;
  formattedDate: string;
} {
  if (!scheduledDateStr) {
    return {
      label: 'Scheduled',
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
      isOverdue: false,
      formattedDate: 'Date not set'
    };
  }

  const d = new Date(scheduledDateStr);
  if (isNaN(d.getTime())) {
    return {
      label: scheduledDateStr,
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
      isOverdue: false,
      formattedDate: scheduledDateStr
    };
  }

  const now = new Date();
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((dDay - nowDay) / (1000 * 60 * 60 * 24));

  const formattedDate = formatCleanDate(scheduledDateStr);

  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      label: overdueDays === 1 ? 'Overdue (1 day)' : `Overdue (${overdueDays} days)`,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800 font-bold',
      isOverdue: true,
      formattedDate
    };
  } else if (diffDays === 0) {
    return {
      label: 'Due Today',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800 font-bold',
      isOverdue: false,
      formattedDate
    };
  } else if (diffDays === 1) {
    return {
      label: 'Due Tomorrow',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/80 dark:text-blue-200 dark:border-blue-800 font-semibold',
      isOverdue: false,
      formattedDate
    };
  } else {
    return {
      label: `Due in ${diffDays} days`,
      badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 font-medium',
      isOverdue: false,
      formattedDate
    };
  }
}

export const CompanyActivityTimeline: React.FC<CompanyActivityTimelineProps> = ({
  historyLogs = [],
  enquiries = [],
  companyName = 'Account',
  companyId,
  contacts = [],
  companies = [],
  salespersons = [],
  isLoading = false,
  onClose,
  onSelectCallLog,
  onEditCallLog,
  onInspectCallLog,
  onOpenActivityDrawer,
  onSelectEnquiry,
  onOpenCompany360,
  onExecuteTask,
  onRefreshTimeline,
  setCallLogs,
  setCompanies,
  setContacts,
  user,
  activeWorkspace,
  isBasicTier = false,
  className = '',
  showHeader = true,
  compact = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'activities' | 'proposals'>('activities');
  const [internalExecutingTask, setInternalExecutingTask] = useState<CallLogEntry | null>(null);
  const [selectedDetailLog, setSelectedDetailLog] = useState<CallLogEntry | null>(null);

  // Contact quick lookup map
  const contactLookup = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => {
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [contacts]);

  // Separate active pending scheduled tasks from completed historical logs
  const queuedTasks = useMemo(() => {
    return historyLogs
      .filter((log) => isScheduledTask(log))
      .sort((a, b) => {
        const timeA = new Date(a.next_followup_date || (a as any).scheduled_for || a.date).getTime() || 0;
        const timeB = new Date(b.next_followup_date || (b as any).scheduled_for || b.date).getTime() || 0;
        return timeA - timeB;
      });
  }, [historyLogs]);

  const pastHistoryLogs = useMemo(() => {
    return historyLogs.filter((log) => !isScheduledTask(log));
  }, [historyLogs]);

  // Filtered pending queued tasks based on search
  const filteredQueuedTasks = useMemo(() => {
    if (!searchTerm.trim()) return queuedTasks;
    const q = searchTerm.toLowerCase();
    return queuedTasks.filter((task) => {
      const contactMatch = (task.contact_name || '').toLowerCase().includes(q);
      const notesMatch =
        (task.requirement_notes || '').toLowerCase().includes(q) ||
        (task.notes || '').toLowerCase().includes(q) ||
        (task.followup_intent || '').toLowerCase().includes(q);
      const phoneMatch = (task.phone_number || task.contact_phone || (task as any).phone || '').toLowerCase().includes(q);
      const purposeMatch = (task.purpose || '').toLowerCase().includes(q);
      return contactMatch || notesMatch || phoneMatch || purposeMatch;
    });
  }, [queuedTasks, searchTerm]);

  // Filtered historical activity logs
  const filteredLogs = useMemo(() => {
    return pastHistoryLogs.filter((log) => {
      if (channelFilter !== 'all') {
        const chan = (log.channel || log.interaction_type || '').toLowerCase();
        if (channelFilter === 'call') {
          if (!chan.includes('call') && !chan.includes('phone')) return false;
        } else if (channelFilter === 'whatsapp' || channelFilter === 'message') {
          if (!chan.includes('whatsapp') && !chan.includes('message') && !chan.includes('chat') && !chan.includes('sms')) return false;
        } else if (channelFilter === 'email') {
          if (!chan.includes('email') && !chan.includes('mail')) return false;
        } else if (channelFilter === 'task') {
          if (!chan.includes('task') && !chan.includes('internal') && !chan.includes('meeting') && !chan.includes('site') && !chan.includes('visit')) return false;
        } else if (!chan.includes(channelFilter.toLowerCase())) {
          return false;
        }
      }
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const contactMatch = (log.contact_name || '').toLowerCase().includes(q);
      const notesMatch =
        (log.requirement_notes || '').toLowerCase().includes(q) ||
        (log.notes || '').toLowerCase().includes(q) ||
        (log.followup_intent || '').toLowerCase().includes(q);
      const statusMatch = (log.status || '').toLowerCase().includes(q) || (log.outcome || '').toLowerCase().includes(q);
      const purposeMatch = (log.purpose || '').toLowerCase().includes(q);
      const agentMatch = (
        (log as any).handled_by_team_member_name ||
        log.sales_person ||
        log.logged_by ||
        ''
      )
        .toLowerCase()
        .includes(q);

      return contactMatch || notesMatch || statusMatch || purposeMatch || agentMatch;
    });
  }, [pastHistoryLogs, searchTerm, channelFilter]);

  const handleExecuteTask = (task: CallLogEntry) => {
    if (onExecuteTask) {
      onExecuteTask(task);
    } else {
      setInternalExecutingTask(task);
    }
  };

  // Filtered proposals
  const filteredEnquiries = useMemo(() => {
    if (!enquiries || enquiries.length === 0) return [];
    if (!searchTerm.trim()) return enquiries;
    const q = searchTerm.toLowerCase();
    return enquiries.filter((e) => {
      const refMatch = (e.quote_ref_no || '').toLowerCase().includes(q) || String(e.sn || '').includes(q);
      const subjectMatch = (e.subject || '').toLowerCase().includes(q);
      const statusMatch = (e.status || '').toLowerCase().includes(q);
      return refMatch || subjectMatch || statusMatch;
    });
  }, [enquiries, searchTerm]);

  const renderChannelIcon = (channelName?: string) => {
    const norm = (channelName || '').toLowerCase();
    if (norm.includes('call') || norm.includes('phone')) return <Phone className="w-3 h-3 text-blue-500 shrink-0" />;
    if (norm.includes('whatsapp')) return <MessageSquare className="w-3 h-3 text-emerald-500 shrink-0" />;
    if (norm.includes('email')) return <Mail className="w-3 h-3 text-indigo-500 shrink-0" />;
    if (norm.includes('person') || norm.includes('meeting')) return <Users className="w-3 h-3 text-purple-500 shrink-0" />;
    if (norm.includes('site')) return <Building className="w-3 h-3 text-amber-500 shrink-0" />;
    return <PhoneCall className="w-3 h-3 text-blue-500 shrink-0" />;
  };

  const getStatusBadgeStyle = (status?: string) => {
    const s = (status || '').toLowerCase().trim();
    if (s.includes('cancelled') || s.includes('canceled')) {
      return 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700';
    }

    const isSuccess =
      s.includes('completed') ||
      s.includes('conducted') ||
      s.includes('connected') ||
      s.includes('sent');

    const isFailed =
      s.includes('invalid') ||
      s.includes('cancelled') ||
      s.includes('canceled') ||
      s.includes('wrong number');

    const isPending =
      s.includes('no answer') ||
      s.includes('busy') ||
      s.includes('voicemail') ||
      s.includes('follow-up') ||
      s.includes('followup') ||
      s.includes('dropped') ||
      s.includes('rescheduled') ||
      s.includes('scheduled') ||
      s.includes('planned') ||
      s.includes('pending');

    if (isSuccess) {
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/80';
    }
    if (isFailed) {
      return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/80';
    }
    if (isPending) {
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/80';
    }
    return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  /**
   * Normalizes channel names for clean badge display:
   * - WhatsApp/SMS/Message -> 'WhatsApp'
   * - Email -> 'Email'
   * - Meeting -> 'Meeting'
   * - Site Visit -> 'Site Visit'
   * - Internal Task -> 'Internal Task'
   * - Call -> 'Phone Call'
   */
  const normalizeChannelBadgeLabel = (rawChannel?: string): string => {
    if (!rawChannel) return 'Phone Call';
    const norm = rawChannel.toLowerCase().trim();
    if (norm.includes('whatsapp') || norm.includes('message') || norm.includes('sms')) return 'WhatsApp';
    if (norm.includes('email') || norm.includes('mail')) return 'Email';
    if (norm.includes('meeting')) return 'Meeting';
    if (norm.includes('site') || norm.includes('visit')) return 'Site Visit';
    if (norm.includes('task') || norm.includes('admin') || norm.includes('internal')) return 'Internal Task';
    if (norm.includes('call') || norm.includes('phone')) return 'Phone Call';
    return rawChannel;
  };

  /**
   * Normalizes status strings for clean, channel-appropriate single-word badge display:
   * - Message / Email: 'Sent', 'Scheduled', 'Failed'
   * - Site Visit / Meeting: 'Completed', 'Scheduled', 'Cancelled'
   * - Internal Task: 'Completed', 'Scheduled', 'In Progress'
   * - Phone Call: 'Connected', 'Scheduled', 'No Answer', 'Busy', 'Call Dropped', 'Invalid Number'
   */
  const normalizeStatusBadgeLabel = (status?: string, channel?: string): string => {
    if (!status) return 'Logged';
    const trimmed = status.trim();
    const lower = trimmed.toLowerCase();
    const chanLower = (channel || '').toLowerCase().trim();
    const isMsgOrEmail = chanLower.includes('whatsapp') || chanLower.includes('message') || chanLower.includes('email') || chanLower.includes('sms') || chanLower.includes('mail');
    const isMeetingOrSite = chanLower.includes('meeting') || chanLower.includes('site') || chanLower.includes('visit');

    if (isMsgOrEmail) {
      if (lower === 'completed' || lower.includes('sent') || lower.includes('delivered')) {
        return 'Sent';
      }
      if (lower.includes('scheduled') || lower.includes('planned') || lower.includes('draft')) {
        return 'Scheduled';
      }
      if (lower.includes('failed') || lower.includes('bounced') || lower.includes('invalid')) {
        return 'Failed';
      }
    }

    if (isMeetingOrSite) {
      if (lower === 'completed' || lower.includes('conducted')) {
        return 'Completed';
      }
      if (lower.includes('scheduled') || lower.includes('planned')) {
        return 'Scheduled';
      }
      if (lower.includes('cancelled') || lower.includes('canceled') || lower.includes('no show') || lower.includes('denied') || lower.includes('rescheduled')) {
        return 'Cancelled';
      }
    }

    if (chanLower.includes('task') || chanLower.includes('internal') || chanLower.includes('admin')) {
      if (lower === 'completed') return 'Completed';
      if (lower.includes('scheduled') || lower.includes('planned')) return 'Scheduled';
      if (lower.includes('progress') || lower.includes('working') || lower.includes('blocked')) return 'In Progress';
    }

    if (lower === 'completed / connected' || lower === 'connected') return 'Connected';
    if (lower === 'no answer / voicemail' || lower === 'no answer / busy' || lower === 'no answer' || lower === 'busy') return 'No Answer';
    if (lower === 'invalid / wrong number' || lower === 'invalid/wrong number' || lower === 'invalid number') return 'Invalid Number';
    if (lower === 'call dropped / disconnected' || lower === 'call dropped/disconnected' || lower === 'call dropped' || lower === 'follow-up required') return 'Call Dropped';
    if (lower === 'scheduled / planned' || lower === 'scheduled / draft' || lower === 'scheduled') return 'Scheduled';

    if (trimmed.includes(' / ')) {
      const parts = trimmed.split(' / ');
      const firstTerm = parts[0]?.trim().toLowerCase();
      if (firstTerm === 'completed' || firstTerm === 'scheduled') {
        return parts.slice(1).join(' / ').trim() || trimmed;
      }
    }

    return trimmed;
  };

  const getOutcomeBadgeStyle = (outcome?: string) => {
    const o = (outcome || '').toLowerCase().trim();
    const isPositive =
      o.includes('meeting') ||
      o.includes('quote') ||
      o.includes('proposal') ||
      o.includes('interested') ||
      o.includes('won') ||
      o.includes('closed') ||
      o.includes('deal') ||
      o.includes('positive') ||
      o.includes('qualified');

    const isNegative =
      o.includes('ghosted') ||
      o.includes('not interested') ||
      o.includes('competitor') ||
      o.includes('blocked') ||
      o.includes('wrong person') ||
      o.includes('unqualified') ||
      o.includes('objection') ||
      o.includes('dnc') ||
      o.includes('lost');

    if (isPositive) {
      return 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60';
    }
    if (isNegative) {
      return 'bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60';
    }
    return 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  return (
    <div className={`flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 overflow-hidden ${className}`}>
      {/* Header bar */}
      {showHeader && (
        <div className={`shrink-0 ${compact ? 'p-2.5 sm:p-3 space-y-2' : 'p-3.5 sm:p-4 space-y-3'} border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-800/80 shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2 flex-wrap">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                    Activity History
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono">
                    {historyLogs.length + enquiries.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Outreach timeline for <span className="font-semibold text-slate-700 dark:text-slate-300">{companyName}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0">
              {onOpenCompany360 && (
                <button
                  type="button"
                  onClick={onOpenCompany360}
                  className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Open full Company 360"
                  aria-label="Open full Company 360"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                  title="Close Activity History"
                  aria-label="Close Activity History"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Sub-tabs if enquiries exist */}
          {enquiries.length > 0 && (
            <div className="flex items-center space-x-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab('activities')}
                className={`flex-1 py-1 px-2.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                  activeTab === 'activities'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Activities ({historyLogs.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('proposals')}
                className={`flex-1 py-1 px-2.5 text-xs font-semibold rounded-md transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                  activeTab === 'proposals'
                    ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Proposals & Quotes ({enquiries.length})</span>
              </button>
            </div>
          )}

          {/* Keyword Search & Channel Filter Bar */}
          <div className="flex items-center gap-2 pt-0.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search notes, contacts, agent, status..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg bg-slate-100/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {activeTab === 'activities' && (
              <div className="shrink-0">
                <select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="py-1.5 px-2.5 text-xs font-medium rounded-lg bg-slate-100/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500 cursor-pointer"
                  aria-label="Filter by channel"
                >
                  <option value="all">All Channels</option>
                  <option value="call">Calls</option>
                  <option value="whatsapp">Messages (WhatsApp)</option>
                  <option value="email">Emails</option>
                  <option value="task">Tasks & Meetings</option>
                </select>
              </div>
            )}
          </div>

          {/* Quick Channel Pills for Rapid Filtering */}
          {activeTab === 'activities' && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {[
                { key: 'all', label: 'All', icon: null },
                { key: 'call', label: 'Calls', icon: <Phone className="w-2.5 h-2.5" /> },
                { key: 'whatsapp', label: 'WhatsApp', icon: <MessageSquare className="w-2.5 h-2.5" /> },
                { key: 'email', label: 'Emails', icon: <Mail className="w-2.5 h-2.5" /> },
                { key: 'task', label: 'Tasks', icon: <Calendar className="w-2.5 h-2.5" /> },
              ].map((ch) => {
                const isActive = channelFilter === ch.key;
                return (
                  <button
                    key={ch.key}
                    type="button"
                    onClick={() => setChannelFilter(ch.key)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all inline-flex items-center gap-1 cursor-pointer border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs font-bold'
                        : 'bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                    }`}
                  >
                    {ch.icon}
                    <span>{ch.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Timeline Feed */}
      <div className={`flex-1 overflow-y-auto ${compact ? 'p-2.5 sm:p-3 space-y-2' : 'p-3.5 sm:p-4 space-y-3'}`}>
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Loading activity history...
            </span>
          </div>
        ) : activeTab === 'activities' ? (
          <>
            {/* Pinned Upcoming / Scheduled Tasks Container */}
            {filteredQueuedTasks.length > 0 && (
              <div className="mb-4 space-y-2.5">
                <div className="flex items-center justify-between px-0.5">
                  <div className="flex items-center space-x-1.5 text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 font-mono">
                    <div className="p-1 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                      <CalendarClock className="w-3.5 h-3.5" />
                    </div>
                    <span>Upcoming / Scheduled Tasks</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800">
                    {filteredQueuedTasks.length} {filteredQueuedTasks.length === 1 ? 'task queued' : 'tasks queued'}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {filteredQueuedTasks.map((task) => {
                    const schedDate = task.next_followup_date || (task as any).scheduled_for || task.date;
                    const dueInfo = getScheduledDueBadge(schedDate);
                    const resolvedContact = task.contact_id ? contactLookup.get(task.contact_id) : undefined;
                    const channelLower = (task.channel || task.interaction_type || '').toLowerCase();
                    const isEmailTask = channelLower.includes('email') || channelLower === 'mail' || Boolean(task.contact_phone && task.contact_phone.includes('@'));
                    const taskEmail = (task as any).email_address || (task.contact_phone && task.contact_phone.includes('@') ? task.contact_phone : '') || resolvedContact?.email || '';
                    const contactPhone = task.contact_phone && !task.contact_phone.includes('@')
                      ? task.contact_phone
                      : (resolvedContact?.mobile || resolvedContact?.phone || (task as any).phone_number || (task as any).phone || '');
                    const rawTaskContactName = (task.contact_name || resolvedContact?.full_name || (task as any).target_contact_person || (task as any).contactPerson || '').trim();
                    const isTaskMainline = !rawTaskContactName ||
                      rawTaskContactName.toLowerCase() === 'no contact person' ||
                      rawTaskContactName.toLowerCase() === 'company mainline' ||
                      rawTaskContactName.toLowerCase() === 'mainline' ||
                      rawTaskContactName.toLowerCase() === 'unassigned';
                    const hasTaskContact = Boolean(task.contact_id && resolvedContact) || (!isTaskMainline && rawTaskContactName !== '');
                    const taskContactName = hasTaskContact ? (!isTaskMainline ? rawTaskContactName : (resolvedContact?.full_name || '')) : '';

                    const taskTargetCompany = (task.company_id ? companies.find((c) => c.id === task.company_id) : null) || (companyId ? companies.find((c) => c.id === companyId) : null);
                    const taskCompPhones = taskTargetCompany ? getCompanyPhones(taskTargetCompany) : [];
                    const matchedTaskPhone = taskCompPhones.find((p) => (p.value && contactPhone && isSamePhoneNumber(p.value, contactPhone)) || p.value === contactPhone || p.number === contactPhone);
                    const taskPhoneLabel = matchedTaskPhone?.label || (task as any).phone_label || (task as any).phoneLabel || 'Phone';

                    const contactDisplayName = hasTaskContact
                      ? `Contact: ${taskContactName}`
                      : (contactPhone ? `Mainline (${taskPhoneLabel || 'Phone'}: ${contactPhone})` : (isEmailTask ? (taskEmail ? `Mainline (Email: ${taskEmail})` : 'Email Outreach') : 'Company Mainline'));
                    const contactDesignation = hasTaskContact ? (resolvedContact?.designation || (task as any).contact_designation || '') : '';
                    const intentText =
                      task.followup_intent ||
                      task.requirement_notes ||
                      task.notes ||
                      task.purpose ||
                      'Follow-up scheduled';
                    const channelName = normalizeChannelBadgeLabel(task.channel || task.interaction_type || (isEmailTask ? 'Email' : 'Call'));
                    const canAccessTask = canAccessActivityDetail(user, task, enquiries, activeWorkspace, salespersons);

                    return (
                      <div
                        key={task.id}
                        id={`queued-task-${task.id}`}
                        className={`${compact ? 'p-2.5 sm:p-3' : 'p-3.5 sm:p-4'} rounded-xl border transition-all shadow-xs ${
                          dueInfo.isOverdue
                            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-400 dark:border-rose-800/80 ring-1 ring-rose-200 dark:ring-rose-900/40'
                            : 'bg-gradient-to-br from-amber-50/70 via-white to-amber-50/40 dark:from-amber-950/25 dark:via-slate-900 dark:to-slate-900 border-amber-400 dark:border-amber-600/70'
                        }`}
                      >
                        {/* Card Header: Channel, Relative Time Badge & Formatted Date */}
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs">
                              {renderChannelIcon(channelName)}
                              <span>{channelName}</span>
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shadow-2xs ${dueInfo.badgeClass}`}>
                              {dueInfo.label}
                            </span>
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{dueInfo.formattedDate}</span>
                            </span>
                          </div>

                          {/* 1-Click Action Launcher or Restricted Badge */}
                          {canAccessTask ? (
                            <div className="flex items-center space-x-1.5 shrink-0">
                              <button
                                type="button"
                                id={`view-task-${task.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDetailLog(task);
                                  if (onInspectCallLog) onInspectCallLog(task);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs flex items-center space-x-1 transition cursor-pointer"
                                title="View details / history"
                              >
                                <span>Details</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>

                              <button
                                type="button"
                                id={`execute-task-${task.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExecuteTask(task);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-black shadow-xs flex items-center space-x-1.5 transition cursor-pointer hover:shadow-sm shrink-0"
                                title="Launch execution center for scheduled task"
                              >
                                <span>⚡ Execute</span>
                              </button>
                            </div>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/80 inline-flex items-center gap-1.5 shrink-0 select-none">
                              <Lock className="w-3 h-3 shrink-0" />
                              <span>Restricted</span>
                            </span>
                          )}
                        </div>

                        {/* Target Contact Person & Direct Phone or Email */}
                        <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
                          <div className="flex items-center space-x-2 min-w-0">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                              isEmailTask
                                ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                                : hasTaskContact
                                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}>
                              {isEmailTask ? <Mail className="w-3 h-3" /> : hasTaskContact ? <User className="w-3 h-3" /> : <Building className="w-3 h-3" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                {contactDisplayName}
                                {contactDesignation && (
                                  <span className="ml-1.5 text-[10px] font-normal text-slate-500 dark:text-slate-400">
                                    ({contactDesignation})
                                  </span>
                                )}
                              </div>
                              {hasTaskContact && (
                                isEmailTask ? (
                                  taskEmail && (
                                    <div className="text-[11px] font-mono font-medium text-purple-600 dark:text-purple-400 flex items-center space-x-1">
                                      <Mail className="w-2.5 h-2.5" />
                                      <span>{taskEmail}</span>
                                    </div>
                                  )
                                ) : (
                                  contactPhone && (
                                    <div className="text-[11px] font-mono font-medium text-blue-600 dark:text-blue-400 flex items-center space-x-1">
                                      <Phone className="w-2.5 h-2.5" />
                                      <span>({contactPhone})</span>
                                    </div>
                                  )
                                )
                              )}
                            </div>
                          </div>
                          {task.purpose && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                              {task.purpose}
                            </span>
                          )}
                        </div>

                        {/* Interaction Intent / Follow-up Notes or Restricted Notes */}
                        {canAccessTask ? (
                          intentText && (
                            <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-800/70 p-2 rounded-lg border border-amber-200/50 dark:border-slate-700/60 leading-relaxed font-sans">
                              <span className="font-bold text-slate-800 dark:text-slate-200 block text-[10px] uppercase tracking-wider text-amber-800 dark:text-amber-400 mb-0.5">
                                Follow-up Intent & Notes:
                              </span>
                              {intentText}
                            </div>
                          )
                        ) : (
                          <div className="mt-2 text-xs italic text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/30 p-2 rounded-lg border border-amber-200/60 dark:border-amber-900/40 flex items-center gap-1.5 font-sans select-none">
                            <Lock className="w-3 h-3 shrink-0" />
                            <span>[Activity notes restricted - Confidential]</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Historical Activity Logs Feed */}
            {pastHistoryLogs.length === 0 && queuedTasks.length === 0 ? (
              /* Compact Empty State per Rule 4 */
              <div className="py-8 px-4 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                <div className="w-9 h-9 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <Clock className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No prior activity logs found
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  No outreach calls or interactions have been logged for this account yet.
                </p>
              </div>
            ) : pastHistoryLogs.length === 0 && queuedTasks.length > 0 ? (
              <div className="py-6 px-4 text-center space-y-1.5 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
                <div className="w-8 h-8 mx-auto rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No prior completed interactions
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Execute the upcoming scheduled task above to record your first completed activity.
                </p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-8 px-4 text-center space-y-1 text-slate-500 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                <p className="font-semibold text-slate-700 dark:text-slate-300">No matching activity logs</p>
                <p className="text-[11px] text-slate-400">Try adjusting your keyword search or channel filter.</p>
              </div>
            ) : (
            filteredLogs.map((log) => {
              const statusLower = (log.status || '').toLowerCase().trim();
              const outcomeLower = (log.outcome || '').toLowerCase().trim();
              const notesText = `${log.requirement_notes || ''} ${log.notes || ''} ${log.followup_intent || ''}`.toLowerCase();
              const isCancelled =
                statusLower === 'cancelled' ||
                statusLower === 'canceled' ||
                statusLower.includes('cancelled') ||
                statusLower.includes('canceled') ||
                notesText.includes('[cancelled]') ||
                notesText.includes('[canceled]');

              const isCompletedLog =
                !isCancelled && (
                  statusLower === 'completed' ||
                  statusLower.includes('completed') ||
                  statusLower === 'sent' ||
                  statusLower.includes('sent') ||
                  statusLower.includes('conducted') ||
                  statusLower === 'connected' ||
                  outcomeLower.includes('completed') ||
                  Boolean((log as any).completed_at) ||
                  Boolean((log as any).completedAt) ||
                  Boolean((log as any).executed_at)
                );

              const completionTimestamp =
                (log as any).completed_at ||
                (log as any).completedAt ||
                (log as any).executed_at ||
                log.date ||
                (log as any).createdAt;

              const timeInfo = isCompletedLog
                ? formatCompletedTimestamp(completionTimestamp)
                : formatTimelineDate(log.date || (log as any).createdAt);

              const resolvedContact = log.contact_id ? contactLookup.get(log.contact_id) : undefined;
              const channelLower = (log.channel || log.interaction_type || '').toLowerCase();
              const isEmailChannel = channelLower.includes('email') || channelLower === 'mail' || Boolean(log.contact_phone && log.contact_phone.includes('@'));
              const emailTarget = (log as any).email_address || (log.contact_phone && log.contact_phone.includes('@') ? log.contact_phone : '') || resolvedContact?.email || '';
              const phoneTarget = log.contact_phone && !log.contact_phone.includes('@') ? log.contact_phone : (resolvedContact?.mobile || resolvedContact?.phone || '');
              const contactPersonName = log.contact_name || resolvedContact?.full_name;

              const rawContact = (log.contact_name || (log as any).contactPerson || resolvedContact?.full_name || '').trim();
              const isMainline = !rawContact ||
                rawContact.toLowerCase() === 'no contact person' ||
                rawContact.toLowerCase() === 'company mainline' ||
                rawContact.toLowerCase() === 'mainline' ||
                rawContact.toLowerCase() === 'unassigned';
              const hasContact = Boolean(log.contact_id && resolvedContact) || (!isMainline && rawContact !== '');
              const contactName = hasContact ? (!isMainline ? rawContact : (resolvedContact?.full_name || '')) : '';

              const targetCompany = (log.company_id ? companies.find((c) => c.id === log.company_id) : null) || (companyId ? companies.find((c) => c.id === companyId) : null);
              const compPhones = targetCompany ? getCompanyPhones(targetCompany) : [];
              const matchedPhone = compPhones.find((p) => (p.value && phoneTarget && isSamePhoneNumber(p.value, phoneTarget)) || p.value === phoneTarget || p.number === phoneTarget);
              const phoneLabel = matchedPhone?.label || (log as any).phone_label || (log as any).phoneLabel || 'Phone';

              const channelName = normalizeChannelBadgeLabel(log.channel || log.interaction_type || (isEmailChannel ? 'Email' : 'Call'));
              const statusLabel = isCancelled ? 'Cancelled' : normalizeStatusBadgeLabel(log.status, channelName);
              const outcomeLabel = log.outcome || null;
              const badgeStyle = getStatusBadgeStyle(isCancelled ? 'cancelled' : (log.status || statusLabel));

              const isExecutableTask =
                !isCancelled &&
                (statusLower === 'scheduled' ||
                 statusLower.includes('scheduled') ||
                 statusLower === 'planned' ||
                 statusLower.includes('planned') ||
                 statusLower === 'draft' ||
                 statusLower.includes('draft') ||
                 statusLower === 'pending' ||
                 isScheduledTask(log)) &&
                !statusLower.includes('completed') &&
                !(log as any).completed_at &&
                !(log as any).executed_at;

              const agentName =
                (log as any).handled_by_team_member_name ||
                log.sales_person ||
                log.logged_by ||
                'Staff';
              const agentInitials = getAgentInitials(agentName);

              const displayNotes = log.requirement_notes || log.notes || log.followup_intent;
              const canAccess = canAccessActivityDetail(user, log, enquiries, activeWorkspace, salespersons);

              return (
                <div
                  key={log.id}
                  onClick={() => {
                    if (canAccess) {
                      setSelectedDetailLog(log);
                      if (onInspectCallLog) onInspectCallLog(log);
                    }
                  }}
                  className={`group relative ${compact ? 'p-2.5 space-y-2' : 'p-3.5 space-y-2.5'} rounded-xl border transition-all duration-150 ${
                    isCancelled
                      ? 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800/80 opacity-80 shadow-2xs'
                      : canAccess
                        ? 'bg-white dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/80 cursor-pointer'
                        : 'bg-slate-50/70 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 shadow-2xs cursor-default select-none'
                  }`}
                  title={canAccess ? "Click to view full interaction details and notes" : "Activity details restricted"}
                >
                  {/* Top Bar: Relative Time, Formatted Date & Badges */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-400">
                      {isCancelled ? (
                        <XCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                      ) : isCompletedLog ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-900 dark:text-white" title={timeInfo.formatted}>
                        {timeInfo.relative}
                      </span>
                      {canAccess ? (
                        <button
                          type="button"
                          id={`view-details-${log.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDetailLog(log);
                            if (onInspectCallLog) onInspectCallLog(log);
                          }}
                          className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1 ml-1 cursor-pointer transition-colors"
                          title="View interaction details"
                        >
                          <span>Details</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 ml-1 select-none">
                          <Lock className="w-2.5 h-2.5 shrink-0" />
                          <span>Restricted</span>
                        </span>
                      )}

                      {canAccess && isExecutableTask && (
                        <button
                          type="button"
                          id={`execute-top-task-${log.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExecuteTask(log);
                          }}
                          className="px-2 py-0.5 rounded-md bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-[10px] font-bold shadow-2xs flex items-center space-x-1 transition cursor-pointer ml-1"
                          title="Launch execution center for scheduled task"
                        >
                          <span>⚡ Execute</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      {/* Channel Pill */}
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {renderChannelIcon(channelName)}
                        <span>{channelName}</span>
                      </span>

                      {/* Status Badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
                        {statusLabel}
                      </span>

                      {/* Independent Outcome Tag - Suppress follow-up badge if cancelled */}
                      {outcomeLabel && outcomeLabel !== log.status && outcomeLabel !== statusLabel && (!isCancelled || !outcomeLabel.toLowerCase().includes('follow-up')) && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getOutcomeBadgeStyle(outcomeLabel)}`}>
                          {outcomeLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Contact Spoken To & Purpose */}
                  <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      {hasContact ? (
                        <>
                          <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            Contact: {contactName}
                          </span>
                          {isEmailChannel ? (
                            emailTarget && (
                              <span className="inline-flex items-center space-x-1 font-mono text-[11px] font-normal text-purple-600 dark:text-purple-400 truncate">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span>({emailTarget})</span>
                              </span>
                            )
                          ) : (
                            phoneTarget && (
                              <span className="font-mono text-[11px] font-normal text-slate-500 dark:text-slate-400 truncate">
                                ({phoneTarget})
                              </span>
                            )
                          )}
                          {resolvedContact?.designation && (
                            <span className="text-slate-400 text-[10px] truncate hidden xs:inline">
                              • {resolvedContact.designation}
                            </span>
                          )}
                        </>
                      ) : isEmailChannel ? (
                        <>
                          <Mail className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                          <span className="font-mono text-purple-700 dark:text-purple-300 font-semibold truncate" title={emailTarget}>
                            {emailTarget ? `Mainline (Email: ${emailTarget})` : 'Email Outreach / Direct'}
                          </span>
                        </>
                      ) : phoneTarget ? (
                        <>
                          <Building className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-mono text-slate-700 dark:text-slate-300 font-medium truncate">
                            Mainline ({phoneLabel || 'Phone'}: {phoneTarget})
                          </span>
                        </>
                      ) : (
                        <>
                          <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-500 dark:text-slate-400 font-medium">
                            Company Mainline / Direct
                          </span>
                        </>
                      )}
                    </div>

                    {log.purpose && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0 max-w-[150px] truncate font-medium">
                        {log.purpose}
                      </span>
                    )}
                  </div>

                  {/* Activity Notes Box or Masked Restricted Notes */}
                  {canAccess ? (
                    displayNotes ? (
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                        "{displayNotes}"
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">No notes recorded for this interaction.</p>
                    )
                  ) : (
                    <div className="p-2.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-amber-700 dark:text-amber-400 text-xs italic flex items-center gap-1.5 font-sans select-none">
                      <Lock className="w-3 h-3 shrink-0" />
                      <span>[Activity notes restricted - Confidential]</span>
                    </div>
                  )}

                  {/* Footer: Agent Initials Avatar & Follow-up Details */}
                  <div className="pt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/60 gap-2">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span
                        className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-[10px] font-bold flex items-center justify-center font-mono border border-blue-200 dark:border-blue-800 shrink-0"
                        title={agentName}
                      >
                        {agentInitials}
                      </span>
                      <span className="truncate text-[11px]">
                        Logged by <strong className="text-slate-700 dark:text-slate-300">{agentName}</strong>
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {canAccess && log.next_followup_date && !isCancelled && (
                        <span className="inline-flex items-center space-x-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>Next: {formatCleanDate(log.next_followup_date)}</span>
                        </span>
                      )}

                      {!canAccess && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/80 inline-flex items-center gap-1 select-none">
                          <Lock className="w-2.5 h-2.5 shrink-0" />
                          <span>Restricted</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </>
      ) : (
        /* Proposals / Quotes Tab */
          enquiries.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/40">
              <div className="w-9 h-9 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                <FileText className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                No proposals or quotes linked yet
              </p>
            </div>
          ) : filteredEnquiries.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-1 text-slate-500 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="font-semibold text-slate-700 dark:text-slate-300">No matching proposals</p>
              <p className="text-[11px] text-slate-400">Try adjusting your search query.</p>
            </div>
          ) : (
            filteredEnquiries.map((e) => {
              const isAuthorized = canAccessEnquiry(user, e, activeWorkspace);
              const spName = getSalespersonFullName(e.sales_person || (e as any).salesperson, salespersons);
              const repInitials = String((e as any).rep || e.sales_person || (e as any).salesperson || '').toUpperCase().trim();
              const dateLogged = e.enquiry_date || (e.created_at || (e as any).createdAt ? formatCleanDate(e.created_at || (e as any).createdAt) : 'Recent');

              if (isAuthorized) {
                return (
                  <div
                    key={e.id}
                    onClick={() => {
                      if (onSelectEnquiry && e.id) {
                        onSelectEnquiry(e.id);
                      }
                    }}
                    className={`${compact ? 'p-2.5 space-y-1.5' : 'p-3.5 space-y-2'} rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-xs hover:shadow-sm transition text-xs cursor-pointer hover:border-purple-400 dark:hover:border-purple-500/80 group`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-slate-900 dark:text-white font-mono text-xs truncate">
                          {e.quote_ref_no || `SN#${e.sn}`}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                        {e.status || 'Active'}
                      </span>
                    </div>

                    {e.subject && (
                      <p className="font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{e.subject}</p>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-700/60">
                      <span className="text-slate-500 dark:text-slate-400">
                        Owner: <strong className="text-slate-700 dark:text-slate-300">{spName}</strong>
                        {repInitials && repInitials !== spName.toUpperCase() ? ` (${repInitials})` : ''}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          {dateLogged}
                        </span>
                        {!isBasicTier && e.value_aed ? (
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            AED {e.value_aed.toLocaleString()}
                          </span>
                        ) : null}
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 group-hover:underline inline-flex items-center gap-0.5">
                          <span>View</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              // Restricted Context-Only View (collision prevention)
              return (
                <div
                  key={e.id}
                  className="p-3.5 rounded-xl bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs space-y-2 text-xs cursor-default select-none"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-slate-700 dark:text-slate-300 font-mono text-xs truncate">
                        {e.quote_ref_no || `SN#${e.sn}`}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {e.status || 'Active'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/80 inline-flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5 shrink-0" />
                        <span>Restricted Access</span>
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                    Proposal details restricted
                  </p>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400">
                      Owner: <strong className="text-slate-700 dark:text-slate-300">{spName}</strong>
                      {repInitials ? ` (${repInitials})` : ''}
                    </span>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        {dateLogged}
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-400 dark:text-slate-500 flex items-center gap-1">
                        <span>AED ••••••</span>
                        <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase">
                          Confidential
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {internalExecutingTask && (
        <LiveExecutionModal
          isOpen={Boolean(internalExecutingTask)}
          onClose={() => setInternalExecutingTask(null)}
          task={internalExecutingTask}
          onSwitchTask={setInternalExecutingTask}
          user={user}
          callLogs={historyLogs}
          contacts={contacts}
          companies={companies}
          enquiries={enquiries}
          setCompanies={setCompanies}
          setContacts={setContacts}
          setCallLogs={setCallLogs}
          onCompleteTask={async (completedTask) => {
            try {
              await CallLogRepository.save(completedTask);
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((l) => (l.id === completedTask.id ? { ...l, ...completedTask } : l)));
              }
            } catch (e) {
              console.warn('Error syncing completed task:', e);
            }
            setInternalExecutingTask(null);
            if (onRefreshTimeline) onRefreshTimeline();
          }}
          onRescheduleTask={async (rescheduledTask) => {
            try {
              await CallLogRepository.save(rescheduledTask);
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((l) => (l.id === rescheduledTask.id ? { ...l, ...rescheduledTask } : l)));
              }
            } catch (e) {
              console.warn('Error syncing rescheduled task:', e);
            }
            setInternalExecutingTask(null);
            if (onRefreshTimeline) onRefreshTimeline();
          }}
          onCancelTask={async (cancelledTask) => {
            try {
              await CallLogRepository.save(cancelledTask);
              if (setCallLogs) {
                setCallLogs((prev) => prev.map((l) => (l.id === cancelledTask.id ? { ...l, ...cancelledTask } : l)));
              }
            } catch (e) {
              console.warn('Error syncing cancelled task:', e);
            }
            setInternalExecutingTask(null);
            if (onRefreshTimeline) onRefreshTimeline();
          }}
          onSuccess={async (updatedTask, spawnedTask) => {
            try {
              await CallLogRepository.save(updatedTask);
              if (spawnedTask) {
                await CallLogRepository.save(spawnedTask);
              }
              if (setCallLogs) {
                setCallLogs((prev) => {
                  let list = prev.map((l) => (l.id === updatedTask.id ? { ...l, ...updatedTask } : l));
                  if (spawnedTask && !list.some((l) => l.id === spawnedTask.id)) {
                    list = [spawnedTask, ...list];
                  }
                  return list;
                });
              }
            } catch (e) {
              console.warn('Error syncing updated task:', e);
            }
            setInternalExecutingTask(null);
            if (onRefreshTimeline) onRefreshTimeline();
          }}
        />
      )}

      {/* Historical Activity Log Detail Modal */}
      {selectedDetailLog && (
        <CallLogDetailModal
          entry={selectedDetailLog}
          currentUser={user}
          companies={companies}
          setCompanies={setCompanies}
          contacts={contacts}
          enquiries={enquiries}
          callLogs={historyLogs}
          activeWorkspace={activeWorkspace}
          onClose={() => setSelectedDetailLog(null)}
          onOpenCompany360={() => {
            setSelectedDetailLog(null);
            if (onOpenCompany360) onOpenCompany360();
          }}
          onEdit={(entry) => {
            setSelectedDetailLog(null);
            if (onEditCallLog) {
              onEditCallLog(entry);
            } else if (onSelectCallLog) {
              onSelectCallLog(entry);
            } else if (onOpenActivityDrawer) {
              onOpenActivityDrawer({
                companyId: entry.company_id || companyId,
                companyName: entry.company_name || companyName,
                logToEdit: entry
              });
            }
          }}
          onDelete={(id) => {
            if (setCallLogs) {
              setCallLogs((prev) => prev.filter((l) => l.id !== id));
            }
            setSelectedDetailLog(null);
            if (onRefreshTimeline) onRefreshTimeline();
          }}
        />
      )}
    </div>
  );
};

export default CompanyActivityTimeline;
