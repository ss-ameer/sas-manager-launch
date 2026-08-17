import React, { useState, useMemo } from 'react';
import { CallLogEntry, Workspace, Salesperson, DropdownOption } from '../types';
import { SYSTEM_CALL_STATUSES, SYSTEM_CALL_OUTCOMES } from '../utils/defaults';
import {
  FileText,
  Printer,
  Download,
  Calendar,
  X,
  Check,
  Filter,
  BarChart2,
  PhoneCall,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';

interface CallLogReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  callLogs: CallLogEntry[];
  activeWorkspace: Workspace;
  salespersons: Salesperson[];
  callStatuses?: DropdownOption[];
  callOutcomes?: DropdownOption[];
}

export default function CallLogReportModal({
  isOpen,
  onClose,
  callLogs,
  activeWorkspace,
  salespersons,
  callStatuses = [],
  callOutcomes = []
}: CallLogReportModalProps) {
  const [reportPeriod, setReportPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');

  const getLocalDateStr = (d: Date = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateStr();
  
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [salespersonFilter, setSalespersonFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  // Helper to extract candidate YYYY-MM-DD date strings from a log
  const getLogDateStrings = (log: CallLogEntry): string[] => {
    const raw = log.date || log.createdAt || '';
    if (!raw) return [];

    const trimmed = raw.trim();
    const results = new Set<string>();

    // 1. Direct YYYY-MM-DD prefix / split by T
    const partBeforeT = trimmed.split('T')[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(partBeforeT)) {
      results.add(partBeforeT);
    }

    // 2. Parse date object to capture local and UTC YYYY-MM-DD
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      results.add(getLocalDateStr(parsed));
      const utcY = parsed.getUTCFullYear();
      const utcM = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const utcD = String(parsed.getUTCDate()).padStart(2, '0');
      results.add(`${utcY}-${utcM}-${utcD}`);
    }

    return Array.from(results);
  };

  const formatReportDate = (raw?: string) => {
    if (!raw) return '—';
    const str = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (str.includes('T') || str.includes(' ')) {
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${mins}`;
      }
      return `${year}-${month}-${day}`;
    }
    return str.split('T')[0] || str;
  };

  // Report Content Toggles
  const [includeStats, setIncludeStats] = useState(true);
  const [includeTable, setIncludeTable] = useState(true);
  const [includeFollowups, setIncludeFollowups] = useState(true);

  const availableStatuses = useMemo(() => {
    let raw: string[] = [];
    if (callStatuses && callStatuses.length > 0) {
      raw = callStatuses.map(s => s.name);
    } else {
      raw = SYSTEM_CALL_STATUSES;
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

  const availableOutcomes = useMemo(() => {
    let raw: string[] = [];
    if (callOutcomes && callOutcomes.length > 0) {
      raw = callOutcomes.map(o => o.name);
    } else {
      raw = SYSTEM_CALL_OUTCOMES;
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

  if (!isOpen) return null;

  // Calculate Date Boundaries
  const now = new Date();
  let effectiveStart = startDate;
  let effectiveEnd = endDate;

  if (reportPeriod === 'today') {
    effectiveStart = todayStr;
    effectiveEnd = todayStr;
  } else if (reportPeriod === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    effectiveStart = getLocalDateStr(y);
    effectiveEnd = getLocalDateStr(y);
  } else if (reportPeriod === 'week') {
    const w = new Date(now);
    w.setDate(w.getDate() - 7);
    effectiveStart = getLocalDateStr(w);
    effectiveEnd = todayStr;
  } else if (reportPeriod === 'month') {
    const m = new Date(now);
    m.setDate(m.getDate() - 30);
    effectiveStart = getLocalDateStr(m);
    effectiveEnd = todayStr;
  }

  if (effectiveStart > effectiveEnd) {
    const temp = effectiveStart;
    effectiveStart = effectiveEnd;
    effectiveEnd = temp;
  }

  // Filter logs based on selection
  const filteredLogs = callLogs.filter((l) => {
    // Date filter
    const logDates = getLogDateStrings(l);
    if (logDates.length > 0) {
      const inRange = logDates.some((ds) => ds >= effectiveStart && ds <= effectiveEnd);
      if (!inRange) return false;
    }
    // Salesperson
    if (salespersonFilter !== 'all' && l.logged_by !== salespersonFilter) return false;
    // Status
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    // Outcome
    if (outcomeFilter !== 'all' && l.outcome !== outcomeFilter) return false;
    return true;
  });

  // Calculate Key Metrics
  const totalCalls = filteredLogs.length;

  const isFailureOutcomeOrStatus = (l: CallLogEntry) => {
    const st = (l.status || '').toLowerCase();
    const oc = (l.outcome || '').toLowerCase();
    return (
      st.includes('no answer') || st.includes('busy') || st.includes('invalid') || st.includes('disconnected') ||
      oc.includes('no answer') || oc.includes('busy') || oc.includes('invalid') || oc.includes('disconnected') || oc.includes('voicemail') || oc.includes('dnc')
    );
  };

  // Completed / Connected calls (excluding connection failures & unanswered attempts)
  const completedCalls = filteredLogs.filter(
    (l) => (l.status === 'Completed' || l.status === 'Connected') && !isFailureOutcomeOrStatus(l)
  ).length;
  const scheduledQueue = filteredLogs.filter((l) => l.status === 'Scheduled').length;
  const interestedCount = filteredLogs.filter(
    (l) => l.outcome && (
      l.outcome.toLowerCase().includes('interested') ||
      l.outcome.toLowerCase().includes('decision maker') ||
      l.outcome.toLowerCase().includes('deal made') ||
      l.outcome.toLowerCase().includes('quote') ||
      l.outcome.toLowerCase().includes('proposal')
    )
  ).length;
  const quoteRequestedCount = filteredLogs.filter(
    (l) => l.outcome && (
      l.outcome.toLowerCase().includes('quote') ||
      l.outcome.toLowerCase().includes('proposal')
    )
  ).length;
  const noAnswerCount = filteredLogs.filter(
    (l) =>
      (l.outcome && (
        l.outcome.toLowerCase().includes('no answer') || 
        l.outcome.toLowerCase().includes('voicemail') || 
        l.outcome.toLowerCase().includes('disconnected') || 
        l.outcome.toLowerCase().includes('busy') ||
        l.outcome.toLowerCase().includes('barrier')
      )) ||
      (l.status && (
        l.status.toLowerCase().includes('no answer') || 
        l.status.toLowerCase().includes('voicemail') || 
        l.status.toLowerCase().includes('disconnected') || 
        l.status.toLowerCase().includes('busy')
      ))
  ).length;

  const pendingFollowupsList = filteredLogs.filter((l) => l.next_followup_date);

  // Generate CSV Data and Download
  const handleExportCSV = () => {
    const headers = [
      'Date',
      'Interaction Channel / Mode',
      'Status',
      'Outcome',
      'Company Name',
      'Contact Person',
      'Phone / Email',
      'Geography',
      'Logged By',
      'Next FollowUp Date',
      'Quote Ref',
      'Notes'
    ];

    const rows = filteredLogs.map((l) => {
      const channelLabel = l.interaction_type === 'email' ? 'Email Log' : l.interaction_type === 'message' ? `Message (${l.message_platform || 'WhatsApp'})` : 'Phone Call';
      const contactInfo = l.interaction_type === 'email' ? (l.email_address || l.contact_phone || '') : (l.contact_phone || '');
      const dateFormatted = formatReportDate(l.date || l.createdAt);
      const companyDisplayName = l.company_name || l.unlinked_name || 'Direct Client';
      const contactDisplayName = l.contact_name || '—';
      const followupDateFormatted = l.next_followup_date ? formatReportDate(l.next_followup_date) : '';

      return [
        `"${dateFormatted}"`,
        `"${channelLabel}"`,
        `"${l.status || ''}"`,
        `"${l.outcome || ''}"`,
        `"${companyDisplayName.replace(/"/g, '""')}"`,
        `"${contactDisplayName.replace(/"/g, '""')}"`,
        `"${contactInfo}"`,
        `"${l.geography || ''}"`,
        `"${l.logged_by || ''}"`,
        `"${followupDateFormatted}"`,
        `"${l.enquiry_quote_ref || ''}"`,
        `"${(l.requirement_notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Call_Operations_Report_${effectiveStart}_to_${effectiveEnd}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Printable Report Generation
  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate the printable PDF report.');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Activities Log Report - ${activeWorkspace.name}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 24px; margin: 0; }
            .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
            .title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
            .badge { background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 11px; }
            .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
            .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
            .card-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
            .card-val { font-size: 18px; font-weight: 900; color: #0f172a; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; }
            th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px 10px; font-weight: 700; }
            td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; color: #1e293b; }
            tr:nth-child(even) { background: #f8fafc; }
            .footer { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div className="header">
            <div>
              <h1 className="title">Activities Log Report</h1>
              <div className="subtitle">
                Workspace: <strong>${activeWorkspace.name}</strong> | Generated on ${new Date().toLocaleString()}
              </div>
            </div>
            <div style="text-align: right;">
              <span className="badge">${reportPeriod.toUpperCase()} REPORT</span>
              <div style="font-size: 11px; color: #475569; margin-top: 4px; font-weight: 600;">
                Period: ${effectiveStart} to ${effectiveEnd}
              </div>
            </div>
          </div>

          ${
            includeStats
              ? `
          <div className="grid">
            <div className="card">
              <div className="card-label">Total Calls Logged</div>
              <div className="card-val">${totalCalls}</div>
            </div>
            <div className="card">
              <div className="card-label">Completed Calls</div>
              <div className="card-val" style="color: #059669;">${completedCalls}</div>
            </div>
            <div className="card">
              <div className="card-label">Interested / Quotes</div>
              <div className="card-val" style="color: #2563eb;">${interestedCount + quoteRequestedCount}</div>
            </div>
            <div className="card">
              <div className="card-label">No Answer / Voicemail</div>
              <div className="card-val" style="color: #d97706;">${noAnswerCount}</div>
            </div>
          </div>
          `
              : ''
          }

          ${
            includeTable
              ? `
          <h3 style="font-size: 14px; margin-bottom: 8px; color: #0f172a;">Call Operations Activity Log</h3>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Channel / Mode</th>
                <th>Status</th>
                <th>Outcome</th>
                <th>Company</th>
                <th>Contact / Details</th>
                <th>Logged By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${
                filteredLogs.length === 0
                  ? `<tr><td colspan="8" style="text-align:center; padding: 16px; color:#94a3b8;">No records found for this period.</td></tr>`
                  : filteredLogs
                      .map((l) => {
                        const channelLabel = l.interaction_type === 'email' ? 'Email Log' : l.interaction_type === 'message' ? `Msg (${l.message_platform || 'WhatsApp'})` : 'Phone Call';
                        const contactDetail = l.interaction_type === 'email' ? (l.email_address || l.contact_phone || '') : (l.contact_phone || '');
                        return `
                <tr>
                  <td style="white-space:nowrap; font-weight:600;">${formatReportDate(l.date || l.createdAt)}</td>
                  <td><span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px;">${channelLabel}</span></td>
                  <td><strong>${l.status || '-'}</strong></td>
                  <td>${l.outcome || '-'}</td>
                  <td><strong>${l.company_name || l.unlinked_name || 'Direct Client'}</strong></td>
                  <td>${l.contact_name || '-'}${contactDetail ? `<br/><span style="color:#64748b;">${contactDetail}</span>` : ''}</td>
                  <td>${l.logged_by || '-'}</td>
                  <td style="max-width: 220px;">${l.requirement_notes || '-'}</td>
                </tr>
              `;
                      })
                      .join('')
              }
            </tbody>
          </table>
          `
              : ''
          }

          ${
            includeFollowups && pendingFollowupsList.length > 0
              ? `
          <h3 style="font-size: 14px; margin-top: 24px; margin-bottom: 8px; color: #b45309;">Scheduled Follow-Ups (${pendingFollowupsList.length})</h3>
          <table>
            <thead>
              <tr style="background:#b45309;">
                <th>Due Date</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Agent</th>
                <th>Next Step Notes</th>
              </tr>
            </thead>
            <tbody>
              ${pendingFollowupsList
                .map(
                  (f) => `
                <tr>
                  <td style="font-weight:700; color:#b45309;">${formatReportDate(f.next_followup_date)}</td>
                  <td><strong>${f.company_name || f.unlinked_name || 'Direct Client'}</strong></td>
                  <td>${f.contact_name || '-'}</td>
                  <td>${f.contact_phone || f.email_address || '-'}</td>
                  <td>${f.logged_by || '-'}</td>
                  <td>${f.requirement_notes || '-'}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
          `
              : ''
          }

          <div className="footer">
            Omni Suite Call Operations & Queue Engine &bull; Confidential Internal Report
          </div>

          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Export Activities Log Report</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Generate printable PDF summaries or export CSV data for workspace records.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Step 1: Select Period */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center space-x-1">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Report Timeframe & Period</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { id: 'today', label: 'Today (Daily)' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'week', label: 'This Week' },
                { id: 'month', label: 'This Month' },
                { id: 'custom', label: 'Custom Range' }
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setReportPeriod(p.id as any)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl border transition ${
                    reportPeriod === p.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {reportPeriod === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-blue-50/50 rounded-xl border border-blue-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">From Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="[color-scheme:dark] w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">To Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="[color-scheme:dark] w-full px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Salesperson / Agent</label>
              <select
                value={salespersonFilter}
                onChange={(e) => setSalespersonFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-semibold bg-white"
              >
                <option value="all">All Agents</option>
                {salespersons.map((s) => (
                  <option key={s.id || s.full_name} value={s.full_name}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-semibold bg-white"
              >
                <option value="all">All Statuses</option>
                {availableStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Call Outcome</label>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl font-semibold bg-white"
              >
                <option value="all">All Outcomes</option>
                {availableOutcomes.map((ot) => (
                  <option key={ot} value={ot}>
                    {ot}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Step 3: Sections Included */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center space-x-1">
              <BarChart2 className="w-4 h-4 text-blue-600" />
              <span>Report Sections & Formatting</span>
            </label>

            <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStats}
                  onChange={(e) => setIncludeStats(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-800">
                  Include Executive Key Metrics Bar (Total, Completed, Quotes, Voicemails)
                </span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTable}
                  onChange={(e) => setIncludeTable(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-800">Include Detailed Calls Log Table</span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeFollowups}
                  onChange={(e) => setIncludeFollowups(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs font-bold text-slate-800">
                  Include Scheduled Action Items & Follow-ups Table
                </span>
              </label>
            </div>
          </div>

          {/* Preview Box */}
          <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 flex items-center justify-between text-xs text-blue-900 font-semibold">
            <div className="flex items-center space-x-2">
              <PhoneCall className="w-4 h-4 text-blue-600" />
              <span>
                Report scope: <strong>{filteredLogs.length}</strong> call records matched for period (
                {effectiveStart} to {effectiveEnd})
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition shadow-sm"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPDF}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 transition shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
