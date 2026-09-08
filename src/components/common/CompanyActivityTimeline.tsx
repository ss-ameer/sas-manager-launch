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
  Briefcase
} from 'lucide-react';
import { CallLogEntry, Contact, Enquiry, Salesperson } from '../../types';
import { canUserClickRecord, getSalespersonFullName } from '../../utils/permissions';

export interface CompanyActivityTimelineProps {
  historyLogs?: CallLogEntry[];
  enquiries?: Enquiry[];
  companyName?: string;
  companyId?: string;
  contacts?: Contact[];
  salespersons?: Salesperson[];
  isLoading?: boolean;
  onClose?: () => void;
  onSelectCallLog?: (log: CallLogEntry) => void;
  onSelectEnquiry?: (id: string) => void;
  onOpenCompany360?: () => void;
  user?: any;
  isBasicTier?: boolean;
  className?: string;
  showHeader?: boolean;
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
      relative = `Scheduled · ${month} ${day}`;
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

export const CompanyActivityTimeline: React.FC<CompanyActivityTimelineProps> = ({
  historyLogs = [],
  enquiries = [],
  companyName = 'Account',
  companyId,
  contacts = [],
  salespersons = [],
  isLoading = false,
  onClose,
  onSelectCallLog,
  onSelectEnquiry,
  onOpenCompany360,
  user,
  isBasicTier = false,
  className = '',
  showHeader = true
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'activities' | 'proposals'>('activities');

  // Contact quick lookup map
  const contactLookup = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => {
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [contacts]);

  // Filtered activity logs
  const filteredLogs = useMemo(() => {
    return historyLogs.filter((log) => {
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
  }, [historyLogs, searchTerm, channelFilter]);

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

  const getStatusBadgeStyle = (status?: string, outcome?: string) => {
    const combined = `${status || ''} ${outcome || ''}`.toLowerCase();
    const isSuccess =
      combined.includes('completed') ||
      combined.includes('conducted') ||
      combined.includes('sent') ||
      combined.includes('interested') ||
      combined.includes('positive') ||
      combined.includes('qualified');

    const isFailed =
      combined.includes('invalid') ||
      combined.includes('cancelled') ||
      combined.includes('wrong number') ||
      combined.includes('not interested') ||
      combined.includes('lost');

    const isPending =
      combined.includes('no answer') ||
      combined.includes('busy') ||
      combined.includes('voicemail') ||
      combined.includes('follow-up') ||
      combined.includes('followup') ||
      combined.includes('rescheduled');

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

  return (
    <div className={`flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100 overflow-hidden ${className}`}>
      {/* Header bar */}
      {showHeader && (
        <div className="shrink-0 p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs space-y-3">
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
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Loading activity history...
            </span>
          </div>
        ) : activeTab === 'activities' ? (
          historyLogs.length === 0 ? (
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
          ) : filteredLogs.length === 0 ? (
            <div className="py-8 px-4 text-center space-y-1 text-slate-500 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="font-semibold text-slate-700 dark:text-slate-300">No matching activity logs</p>
              <p className="text-[11px] text-slate-400">Try adjusting your keyword search or channel filter.</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const timeInfo = formatTimelineDate(log.date || (log as any).createdAt);
              const resolvedContact = log.contact_id ? contactLookup.get(log.contact_id) : undefined;
              const contactDisplayName =
                log.contact_name ||
                resolvedContact?.full_name ||
                (log.contact_phone ? `Contact (${log.contact_phone})` : null);

              const channelName = log.channel || log.interaction_type || 'Call';
              const statusLabel = log.status || 'Logged';
              const outcomeLabel = log.outcome || null;
              const badgeStyle = getStatusBadgeStyle(log.status, log.outcome);

              const agentName =
                (log as any).handled_by_team_member_name ||
                log.sales_person ||
                log.logged_by ||
                'Staff';
              const agentInitials = getAgentInitials(agentName);

              const displayNotes = log.requirement_notes || log.notes || log.followup_intent;
              const canClick = user && salespersons ? canUserClickRecord(user, log, salespersons) : true;

              return (
                <div
                  key={log.id}
                  onClick={() => {
                    if (canClick && onSelectCallLog) {
                      onSelectCallLog(log);
                    }
                  }}
                  className={`group relative p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-xs hover:shadow-sm transition-all duration-150 space-y-2.5 ${
                    canClick && onSelectCallLog ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500/80' : ''
                  }`}
                >
                  {/* Top Bar: Relative Time, Formatted Date & Badges */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-400">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-900 dark:text-white" title={timeInfo.formatted}>
                        {timeInfo.relative}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">
                        • {timeInfo.formatted}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      {/* Channel Pill */}
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {renderChannelIcon(channelName)}
                        <span>{channelName}</span>
                      </span>

                      {/* Status / Outcome Badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
                        {statusLabel}
                        {outcomeLabel && outcomeLabel !== statusLabel && (
                          <span className="ml-1 opacity-90 font-medium">({outcomeLabel})</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Sub-header: Formatted Date on mobile */}
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono sm:hidden">
                    {timeInfo.formatted}
                  </div>

                  {/* Contact Spoken To & Purpose */}
                  <div className="flex items-center justify-between gap-2 text-xs flex-wrap">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      {contactDisplayName ? (
                        <>
                          <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {contactDisplayName}
                          </span>
                          {resolvedContact?.designation && (
                            <span className="text-slate-400 text-[10px] truncate hidden xs:inline">
                              • {resolvedContact.designation}
                            </span>
                          )}
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

                  {/* Activity Notes Box */}
                  {displayNotes ? (
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
                      "{displayNotes}"
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No notes recorded for this interaction.</p>
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
                      {log.next_followup_date && (
                        <span className="inline-flex items-center space-x-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>Next: {formatCleanDate(log.next_followup_date)}</span>
                        </span>
                      )}
                      {canClick && onSelectCallLog && (
                        <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 group-hover:underline flex items-center space-x-0.5">
                          <span>View</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )
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
              const canClick = user && salespersons ? canUserClickRecord(user, e, salespersons) : true;
              const spName = getSalespersonFullName(e.sales_person, salespersons);

              return (
                <div
                  key={e.id}
                  onClick={() => {
                    if (canClick && onSelectEnquiry && e.id) {
                      onSelectEnquiry(e.id);
                    }
                  }}
                  className={`p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 shadow-xs hover:shadow-sm transition space-y-2 text-xs ${
                    canClick && onSelectEnquiry ? 'cursor-pointer hover:border-purple-400 dark:hover:border-purple-500/80' : ''
                  }`}
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
                    </span>
                    <div className="flex items-center space-x-2">
                      {(e.created_at || (e as any).createdAt) && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          {formatCleanDate(e.created_at || (e as any).createdAt)}
                        </span>
                      )}
                      {!isBasicTier && e.value_aed ? (
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          AED {e.value_aed.toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
};

export default CompanyActivityTimeline;
