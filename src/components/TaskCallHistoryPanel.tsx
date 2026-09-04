import React, { useState, useMemo } from 'react';
import {
  History,
  Phone,
  Mail,
  MessageSquare,
  User,
  Building,
  ExternalLink,
  Search,
  PanelRightClose,
  Clock,
  Sparkles,
  Smartphone,
  Users,
  CheckCircle2,
  Calendar,
  Filter
} from 'lucide-react';
import { CallLogEntry, Contact } from '../types';

export interface TaskCallHistoryPanelProps {
  companyName?: string;
  companyId?: string;
  historyLogs: CallLogEntry[];
  isLoading?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenCompany360?: () => void;
  contacts?: Contact[];
  className?: string;
  isMobile?: boolean;
}

export function formatRelativeActivityTime(dateStr?: string): { relative: string; formatted: string } {
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

    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const timeString = `${hours}:${minutes} ${ampm}`;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    const dateFormatted = `${month} ${day}, ${year} • ${timeString}`;

    let relative = '';
    if (isToday) {
      relative = `Today at ${timeString}`;
    } else if (isYesterday) {
      relative = `Yesterday at ${timeString}`;
    } else if (diffDays > 0 && diffDays < 7) {
      relative = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago • ${timeString}`;
    } else if (diffDays >= 7 && diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      relative = `${weeks} ${weeks === 1 ? 'wk' : 'wks'} ago (${month} ${day})`;
    } else {
      relative = `${month} ${day}, ${year}`;
    }

    return { relative, formatted: dateFormatted };
  } catch {
    return { relative: dateStr, formatted: dateStr };
  }
}

export const TaskCallHistoryPanel: React.FC<TaskCallHistoryPanelProps> = ({
  companyName = 'Account',
  companyId,
  historyLogs,
  isLoading = false,
  isExpanded,
  onToggleExpand,
  onOpenCompany360,
  contacts = [],
  className = '',
  isMobile = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  // Contact quick lookup map
  const contactLookup = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => {
      if (c.id) map.set(c.id, c);
    });
    return map;
  }, [contacts]);

  // Filtered list based on search and channel
  const filteredLogs = useMemo(() => {
    return historyLogs.filter((log) => {
      if (channelFilter !== 'all') {
        const chan = (log.channel || log.interaction_type || '').toLowerCase();
        if (!chan.includes(channelFilter.toLowerCase())) return false;
      }
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const contactMatch = (log.contact_name || '').toLowerCase().includes(q);
      const notesMatch = (log.requirement_notes || '').toLowerCase().includes(q) || (log.notes || '').toLowerCase().includes(q);
      const statusMatch = (log.status || '').toLowerCase().includes(q) || (log.outcome || '').toLowerCase().includes(q);
      const purposeMatch = (log.purpose || '').toLowerCase().includes(q);
      return contactMatch || notesMatch || statusMatch || purposeMatch;
    });
  }, [historyLogs, searchTerm, channelFilter]);

  const renderChannelIcon = (channelName?: string) => {
    const norm = (channelName || '').toLowerCase();
    if (norm.includes('call') || norm.includes('phone')) return <Phone className="w-3 h-3 text-blue-500" />;
    if (norm.includes('whatsapp')) return <MessageSquare className="w-3 h-3 text-emerald-500" />;
    if (norm.includes('email')) return <Mail className="w-3 h-3 text-indigo-500" />;
    if (norm.includes('person') || norm.includes('meeting')) return <Users className="w-3 h-3 text-purple-500" />;
    if (norm.includes('sms')) return <Smartphone className="w-3 h-3 text-amber-500" />;
    return <Phone className="w-3 h-3 text-blue-500" />;
  };

  const getStatusBadgeStyle = (status?: string, outcome?: string) => {
    const stLower = (status || '').toLowerCase();
    const outLower = (outcome || '').toLowerCase();
    const combined = `${stLower} ${outLower}`;

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
    <div
      id="task-call-history-panel"
      className={`flex flex-col bg-slate-50/70 dark:bg-slate-900/80 border-l border-slate-200 dark:border-slate-800 h-full overflow-hidden transition-all duration-200 ${className}`}
    >
      {/* Sticky Header with Counter Badge & Action Controls */}
      <div className="sticky top-0 z-10 px-4 py-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
              <History className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Previous Activity
                </span>
                <span
                  id="history-logs-counter-badge"
                  className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                >
                  {historyLogs.length} {historyLogs.length === 1 ? 'Log' : 'Logs'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Interaction timeline for {companyName}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {onOpenCompany360 && companyId && (
              <button
                type="button"
                id="panel-open-company-360-button"
                onClick={onOpenCompany360}
                className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                title="View Full Company 360 History"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              id="collapse-history-panel-button"
              onClick={onToggleExpand}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="Collapse History Panel"
              aria-label="Collapse History Panel"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Filter & Search Bar (only if more than 2 logs) */}
        {historyLogs.length > 2 && (
          <div className="flex items-center gap-1.5 pt-1">
            <div className="relative flex-1">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter logs by keyword or contact..."
                className="w-full pl-6 pr-2 py-1 text-[11px] rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="py-1 px-1.5 text-[11px] rounded-md bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-hidden focus:border-blue-500"
              aria-label="Filter by channel"
            >
              <option value="all">All</option>
              <option value="call">Call</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="meeting">Meeting</option>
            </select>
          </div>
        )}
      </div>

      {/* Feed Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Retrieving past interaction logs...
            </span>
          </div>
        ) : historyLogs.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-white/40 dark:bg-slate-900/40">
            <div className="w-9 h-9 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
              <History className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No prior interactions recorded
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
              No prior interactions recorded for this company. Ready for initial outreach.
            </p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-8 px-4 text-center space-y-1 text-slate-500 text-xs">
            <p className="font-semibold text-slate-700 dark:text-slate-300">No matching activity logs</p>
            <p className="text-[11px] text-slate-400">Try adjusting your search query or channel filter.</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const timeInfo = formatRelativeActivityTime(log.date || log.createdAt);
            const resolvedContact = log.contact_id ? contactLookup.get(log.contact_id) : undefined;
            const contactDisplayName =
              log.contact_name ||
              resolvedContact?.full_name ||
              (log.contact_phone ? `Contact (${log.contact_phone})` : null);

            const channelName = log.channel || log.interaction_type || 'Call';
            const statusLabel = log.status || 'Logged';
            const outcomeLabel = log.outcome || null;
            const badgeStyle = getStatusBadgeStyle(log.status, log.outcome);

            const displayNotes = log.requirement_notes || log.notes || log.followup_intent;

            return (
              <div
                key={log.id}
                className="group relative p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 hover:border-blue-300 dark:hover:border-blue-700/60 shadow-xs hover:shadow-sm transition-all duration-150 space-y-2 text-xs"
              >
                {/* Entry Header: Date/Timestamp & Channel/Disposition Badges */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  {/* Timestamp */}
                  <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-400 font-medium">
                    <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-200" title={timeInfo.formatted}>
                      {timeInfo.relative}
                    </span>
                  </div>

                  {/* Channel & Disposition Badge */}
                  <div className="flex items-center space-x-1 flex-wrap gap-y-1">
                    {/* Channel Pill */}
                    <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {renderChannelIcon(channelName)}
                      <span>{channelName}</span>
                    </span>

                    {/* Disposition / Status Pill */}
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeStyle}`}>
                      {statusLabel}
                      {outcomeLabel && outcomeLabel !== statusLabel && (
                        <span className="ml-1 opacity-90 font-medium">({outcomeLabel})</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Contact Spoken To / Mainline */}
                <div className="flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 text-[11px]">
                  {contactDisplayName ? (
                    <>
                      <User className="w-3 h-3 text-blue-500 shrink-0" />
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {contactDisplayName}
                      </span>
                      {resolvedContact?.designation && (
                        <span className="text-slate-400 text-[10px] truncate">
                          • {resolvedContact.designation}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <Building className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-slate-500 dark:text-slate-400 font-medium">
                        Company Mainline / Direct
                      </span>
                    </>
                  )}

                  {log.purpose && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 truncate max-w-[120px]">
                      {log.purpose}
                    </span>
                  )}
                </div>

                {/* Activity Notes / Requirement Summary */}
                {displayNotes ? (
                  <div className="p-2 rounded-lg bg-slate-50/90 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/80 text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed whitespace-pre-wrap">
                    {displayNotes}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-400 italic">No notes recorded for this interaction.</p>
                )}

                {/* Handled by footer */}
                {(log.sales_person || log.handled_by_team_member_name || log.logged_by) && (
                  <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800/60">
                    <span>
                      Logged by {log.handled_by_team_member_name || log.sales_person || log.logged_by}
                    </span>
                    {log.next_followup_date && (
                      <span className="inline-flex items-center space-x-1 text-amber-600 dark:text-amber-400 font-medium">
                        <Calendar className="w-2.5 h-2.5" />
                        <span>Next: {log.next_followup_date}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Panel Footer with 360 shortcut */}
      {companyId && onOpenCompany360 && (
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 shrink-0">
          <button
            type="button"
            id="panel-footer-company-360-btn"
            onClick={onOpenCompany360}
            className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50/80 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200/80 dark:border-blue-800/80 transition cursor-pointer shadow-2xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Complete Company 360 History</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default TaskCallHistoryPanel;
