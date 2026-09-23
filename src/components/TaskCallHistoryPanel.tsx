/**
 * TaskCallHistoryPanel.tsx (RETIRED)
 *
 * NOTE: This component is retired. All views now use `CompanyActivityTimeline` directly
 * with `compact={true}` for unified activity rendering, omnichannel disposition pills,
 * and company-level chronological timeline management.
 *
 * This file is retained strictly as a backward-compatibility stub to guarantee zero
 * orphaned import or export breakages across future modular extensions.
 */

import React from 'react';
import { CallLogEntry, Contact, Company } from '../types';
import { CompanyActivityTimeline } from './common/CompanyActivityTimeline';

export interface TaskCallHistoryPanelProps {
  companyName?: string;
  companyId?: string;
  company?: Company;
  historyLogs: CallLogEntry[];
  isLoading?: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onOpenCompany360?: () => void;
  onSelectCallLog?: (log: CallLogEntry) => void;
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

export function formatFollowupDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const baseDate = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const isMidnight =
      (d.getHours() === 0 && d.getMinutes() === 0) ||
      dateStr.endsWith('T00:00:00.000Z') ||
      dateStr.endsWith('T00:00:00Z') ||
      /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());

    if (!isMidnight) {
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${baseDate}, ${hours}:${minutes} ${ampm}`;
    }
    return baseDate;
  } catch {
    return dateStr;
  }
}

/**
 * @deprecated Use CompanyActivityTimeline directly with `compact={true}`.
 * Clean backward-compatibility wrapper around CompanyActivityTimeline.
 */
export const TaskCallHistoryPanel: React.FC<TaskCallHistoryPanelProps> = ({
  companyName = 'Account',
  companyId,
  company,
  historyLogs = [],
  isLoading = false,
  onToggleExpand,
  onOpenCompany360,
  onSelectCallLog,
  contacts = [],
  className = ''
}) => {
  return (
    <CompanyActivityTimeline
      companyName={companyName}
      companyId={companyId || company?.id}
      historyLogs={historyLogs}
      isLoading={isLoading}
      compact={true}
      showHeader={true}
      onClose={onToggleExpand}
      onOpenCompany360={onOpenCompany360}
      onSelectCallLog={onSelectCallLog}
      onInspectCallLog={onSelectCallLog}
      contacts={contacts}
      className={className}
    />
  );
};

export default TaskCallHistoryPanel;

