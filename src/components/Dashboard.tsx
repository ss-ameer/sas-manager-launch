import React, { useState, useMemo, useEffect } from 'react';
import { Enquiry, Company, Salesperson, CallLogEntry, Contact, UserProfile } from '../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import {
  TrendingUp,
  Award,
  AlertTriangle,
  FolderLock,
  DollarSign,
  Briefcase,
  CheckCircle,
  HelpCircle,
  Calendar,
  Phone,
  MessageSquare,
  Zap,
  Clock,
  Radar,
  Building2,
  User,
  FileText,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Activity,
  BarChart3,
  Target,
  Users,
  Mail,
  MapPin,
  Filter,
  Gauge,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';

interface DashboardProps {
  enquiries: Enquiry[];
  companies: Company[];
  salespersons: Salesperson[];
  onSelectEnquiry: (id: string) => void;
  callLogs?: CallLogEntry[];
  contacts?: Contact[];
  user?: UserProfile | null;
  onOpenMobileMenu?: () => void;
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
  }) => void;
}

export default function Dashboard({
  enquiries,
  companies,
  salespersons,
  onSelectEnquiry,
  callLogs = [],
  contacts = [],
  user,
  onOpenActivityDrawer,
  onOpenMobileMenu
}: DashboardProps) {
  // 1. Pipeline value totals
  const totalPipelineActive = enquiries
    .filter((e) => e.status === 'Active')
    .reduce((sum, e) => sum + e.value_aed, 0);

  const totalWon = enquiries
    .filter((e) => e.status === 'Order Received')
    .reduce((sum, e) => sum + e.value_aed, 0);

  const totalLost = enquiries
    .filter((e) => e.status === 'Lost')
    .reduce((sum, e) => sum + e.value_aed, 0);

  const totalAll = enquiries.reduce((sum, e) => sum + e.value_aed, 0);

  // 2. Win rate calculation: Won / (Won + Lost)
  const totalClosedCount = enquiries.filter((e) => ['Order Received', 'Lost'].includes(e.status)).length;
  const wonCount = enquiries.filter((e) => e.status === 'Order Received').length;
  const winRate = totalClosedCount > 0 ? Math.round((wonCount / totalClosedCount) * 100) : 0;

  // 3. Overdue follow-ups
  const today = new Date().toISOString().split('T')[0];

  // Company Map for quick name lookup
  const companyMap = React.useMemo(() => {
    return new Map(companies.map((c) => [c.id, c.display_name]));
  }, [companies]);

  // Follow-Up Data Processing
  const followUpItems = useMemo(() => {
    const items: Array<{
      id: string;
      company_id?: string;
      company_name?: string;
      contact_id?: string;
      contact_name?: string;
      enquiry_id?: string;
      enquiry_quote_ref?: string;
      followup_date: string;
      status: string;
      notes: string;
      sales_person?: string;
      phone?: string;
      originalLog?: CallLogEntry;
    }> = [];

    const seenKeys = new Set<string>();

    (callLogs || []).forEach((l) => {
      const fDate = l.next_followup_date || (l as any).next_follow_up || (l as any).follow_up_date;
      if (!fDate) return;
      const isClosed = ['Completed', 'Cancelled', 'Closed', 'Closed - Deal Made'].includes(l.status);
      if (isClosed) return;

      let compName = l.company_id ? (companyMap.get(l.company_id) || l.company_name) : l.company_name;

      let contName = l.contact_name;
      if (!contName && l.contact_id && contacts) {
        const matchedC = contacts.find((c) => c.id === l.contact_id);
        if (matchedC) contName = matchedC.full_name;
      }

      let phone = l.contact_phone || '';
      if (!phone && l.contact_id && contacts) {
        const matchedC = contacts.find((c) => c.id === l.contact_id);
        if (matchedC) {
          phone = matchedC.mobile || matchedC.landline || (matchedC.phones && matchedC.phones[0]?.number) || '';
        }
      }
      if (!phone && l.company_id && companies) {
        const matchedComp = companies.find((c) => c.id === l.company_id);
        if (matchedComp) {
          phone = matchedComp.general_phone || (matchedComp.phones && matchedComp.phones[0]?.number) || '';
        }
      }

      const key = `log_${l.id || l.date}_${fDate}`;
      seenKeys.add(key);

      items.push({
        id: l.id || key,
        company_id: l.company_id,
        company_name: compName || 'Direct Client',
        contact_id: l.contact_id,
        contact_name: contName,
        enquiry_id: l.enquiry_id,
        enquiry_quote_ref: l.enquiry_quote_ref,
        followup_date: fDate,
        status: l.status || 'Pending',
        notes: l.requirement_notes || l.outcome || l.purpose || 'Follow-up scheduled from previous engagement.',
        sales_person: l.sales_person || l.handled_by_team_member_name,
        phone,
        originalLog: l
      });
    });

    (enquiries || []).forEach((e) => {
      if (e.status === 'Active' && e.next_followup_date) {
        const key = `enq_${e.id}_${e.next_followup_date}`;
        if (!seenKeys.has(key)) {
          let compName = companyMap.get(e.company_id);
          let contName = '';
          let phone = '';
          if (e.contact_id && contacts) {
            const matchedC = contacts.find((c) => c.id === e.contact_id);
            if (matchedC) {
              contName = matchedC.full_name;
              phone = matchedC.mobile || matchedC.landline || (matchedC.phones && matchedC.phones[0]?.number) || '';
            }
          }
          if (!phone && e.company_id && companies) {
            const matchedComp = companies.find((c) => c.id === e.company_id);
            if (matchedComp) {
              phone = matchedComp.general_phone || (matchedComp.phones && matchedComp.phones[0]?.number) || '';
            }
          }

          items.push({
            id: key,
            company_id: e.company_id,
            company_name: compName || 'Direct Client',
            contact_id: e.contact_id,
            contact_name: contName,
            enquiry_id: e.id,
            enquiry_quote_ref: e.quote_ref_no,
            followup_date: e.next_followup_date,
            status: 'Active Enquiry',
            notes: e.subject || e.remarks || `Proposal #${e.quote_ref_no} - AED ${e.value_aed.toLocaleString()}`,
            sales_person: e.sales_person,
            phone
          });
        }
      }
    });

    return items;
  }, [callLogs, enquiries, companyMap, contacts, companies]);

  const overdueList = useMemo(() => {
    return followUpItems
      .filter((item) => item.followup_date < today)
      .sort((a, b) => a.followup_date.localeCompare(b.followup_date));
  }, [followUpItems, today]);

  const todayList = useMemo(() => {
    return followUpItems.filter((item) => item.followup_date === today);
  }, [followUpItems, today]);

  const upcomingList = useMemo(() => {
    return followUpItems
      .filter((item) => item.followup_date > today)
      .sort((a, b) => a.followup_date.localeCompare(b.followup_date));
  }, [followUpItems, today]);

  const [activeRadarTab, setActiveRadarTab] = useState<'overdue' | 'today' | 'upcoming'>('overdue');

  useEffect(() => {
    if (overdueList.length > 0) {
      setActiveRadarTab('overdue');
    } else if (todayList.length > 0) {
      setActiveRadarTab('today');
    } else if (upcomingList.length > 0) {
      setActiveRadarTab('upcoming');
    }
  }, [overdueList.length, todayList.length, upcomingList.length]);

  const activeTabItems = activeRadarTab === 'overdue' ? overdueList : activeRadarTab === 'today' ? todayList : upcomingList;

  const getRelativeTimeBadge = (dateStr: string) => {
    const targetDate = new Date(dateStr);
    const todayDate = new Date(today);
    const diffTime = targetDate.getTime() - todayDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24));

    if (diffDays < 0) {
      const abs = Math.abs(diffDays);
      return {
        text: `${abs} ${abs === 1 ? 'day' : 'days'} overdue`,
        className: 'bg-rose-50 text-rose-700 border-rose-200'
      };
    } else if (diffDays === 0) {
      return {
        text: 'Due Today',
        className: 'bg-amber-50 text-amber-800 border-amber-300 font-bold'
      };
    } else {
      return {
        text: diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`,
        className: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    }
  };

  const overdueFollowups = enquiries.filter(
    (e) => e.status === 'Active' && e.next_followup_date && e.next_followup_date < today
  );

  // 4. Chart 1: Pipeline value by Status
  const statusColors: { [key: string]: string } = {
    Active: '#3b82f6', // blue
    'Order Received': '#10b981', // green
    Lost: '#ef4444', // red
    Dead: '#6b7280', // gray
    Hold: '#f59e0b', // orange
    Delayed: '#8b5cf6', // purple
    'Cancelled PO': '#ec4899' // pink
  };

  const statusTotalsMap = enquiries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + e.value_aed;
    return acc;
  }, {} as { [key: string]: number });

  const statusChartData = Object.keys(statusTotalsMap).map((status) => ({
    name: status,
    value: statusTotalsMap[status],
    color: statusColors[status] || '#cbd5e1'
  }));

  // 5. Chart 2: Count by Product Type (Physical Equipment Components only)
  const productTypeCountMap: { [key: string]: number } = {};
  enquiries.forEach((e) => {
    (e.line_items || []).forEach((item) => {
      const isCharge = item.item_type === 'charge' || item.item_type === 'discount';
      const isChargeCategory = ['Service / Charge', 'Transportation', 'Freight', 'Services', 'N/A'].includes(item.product_type);
      if (isCharge || isChargeCategory) {
        return; // Exclude non-product fees/transportation from physical equipment volume counts
      }
      productTypeCountMap[item.product_type] = (productTypeCountMap[item.product_type] || 0) + item.quantity;
    });
  });

  const productTypeChartData = Object.keys(productTypeCountMap)
    .map((type) => ({
      name: type,
      count: productTypeCountMap[type]
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8); // Top 8 items

  // 6. Chart 3: Pipeline Value by Salesperson
  const salespersonValueMap = enquiries.reduce((acc, e) => {
    acc[e.sales_person] = (acc[e.sales_person] || 0) + e.value_aed;
    return acc;
  }, {} as { [key: string]: number });

  const salespersonChartData = salespersons.map((s, idx) => ({
    id: s.id || `sp-${idx}-${s.initials}`,
    initials: s.initials,
    name: s.full_name,
    value: salespersonValueMap[s.initials] || 0
  })).sort((a, b) => b.value - a.value);

  // Utility to format currency in AED
  const formatCurrency = (val: number) => {
    const symbol = 'AED ';
    if (val >= 1000000) {
      return `${symbol}${(val / 1000000).toFixed(2)}M`;
    } else if (val >= 1000) {
      return `${symbol}${(val / 1000).toFixed(1)}k`;
    }
    return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatYAxis = (v: number) => {
    if (v >= 1000000) {
      return `${(v / 1000000).toFixed(1)}M`;
    }
    return `${(v / 1000).toFixed(0)}k`;
  };

  // 7. Activity Velocity & Performance Analytics Calculations
  const [activityTimeFilter, setActivityTimeFilter] = useState<'this_week' | 'this_month' | 'last_30_days' | 'all'>('this_month');

  const filteredCallLogs = useMemo(() => {
    if (activityTimeFilter === 'all') return callLogs;
    const now = new Date();
    let cutoff = new Date();
    if (activityTimeFilter === 'this_week') {
      cutoff.setDate(now.getDate() - 7);
    } else if (activityTimeFilter === 'this_month') {
      cutoff.setDate(1); // 1st of current month
    } else if (activityTimeFilter === 'last_30_days') {
      cutoff.setDate(now.getDate() - 30);
    }
    const cutoffStr = cutoff.toISOString().split('T')[0];

    return callLogs.filter((l) => {
      const logDate = l.date || (l as any).createdAt || (l as any).timestamp;
      if (!logDate) return true;
      return logDate >= cutoffStr;
    });
  }, [callLogs, activityTimeFilter]);

  const channelDistribution = useMemo(() => {
    const channelsList: Array<{ id: string; label: string; icon: any; color: string; bg: string }> = [
      { id: 'Call', label: 'Call', icon: Phone, color: 'text-emerald-600', bg: 'bg-emerald-500' },
      { id: 'WhatsApp', label: 'WhatsApp', icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-500' },
      { id: 'Email', label: 'Email', icon: Mail, color: 'text-blue-600', bg: 'bg-blue-500' },
      { id: 'Meeting', label: 'Meeting', icon: Users, color: 'text-purple-600', bg: 'bg-purple-500' },
      { id: 'Site Visit', label: 'Site Visit', icon: MapPin, color: 'text-amber-600', bg: 'bg-amber-500' }
    ];

    const counts: Record<string, number> = {
      Call: 0,
      WhatsApp: 0,
      Email: 0,
      Meeting: 0,
      'Site Visit': 0
    };

    filteredCallLogs.forEach((l) => {
      const ch = l.channel || 'Call';
      if (counts[ch] !== undefined) {
        counts[ch]++;
      } else {
        counts['Call']++;
      }
    });

    const total = Object.values(counts).reduce((s, v) => s + v, 0);

    return {
      channels: channelsList.map((c) => ({
        ...c,
        count: counts[c.id] || 0,
        pct: total > 0 ? Math.round(((counts[c.id] || 0) / total) * 100) : 0
      })),
      total
    };
  }, [filteredCallLogs]);

  const complianceMetrics = useMemo(() => {
    const scheduled = filteredCallLogs.filter(
      (l) => l.next_followup_date || (l as any).next_follow_up || (l as any).follow_up_date
    );
    const totalScheduled = scheduled.length;
    const completedScheduled = scheduled.filter((l) =>
      ['Completed', 'Closed', 'Closed - Deal Made'].includes(l.status)
    ).length;

    const rate = totalScheduled > 0 ? Math.round((completedScheduled / totalScheduled) * 100) : (filteredCallLogs.length > 0 ? 100 : 0);

    return {
      totalScheduled,
      completedScheduled,
      rate
    };
  }, [filteredCallLogs]);

  const salesRepLeaderboard = useMemo(() => {
    const repCounts: Record<string, { id: string; initials: string; fullName: string; count: number; completed: number }> = {};

    filteredCallLogs.forEach((l) => {
      const repKey = l.sales_person || l.handled_by_team_member_name || 'Unassigned';
      const matchedSp = salespersons.find((s) => s.initials === repKey || s.full_name === repKey);
      const name = matchedSp ? matchedSp.full_name : repKey;
      const initials = matchedSp ? matchedSp.initials : repKey.substring(0, 2).toUpperCase();

      if (!repCounts[repKey]) {
        repCounts[repKey] = {
          id: matchedSp?.id || `rep-${repKey}`,
          initials,
          fullName: name,
          count: 0,
          completed: 0
        };
      }
      repCounts[repKey].count++;
      if (['Completed', 'Closed', 'Closed - Deal Made'].includes(l.status)) {
        repCounts[repKey].completed++;
      }
    });

    const list = Object.values(repCounts).sort((a, b) => b.count - a.count);
    const maxCount = list.length > 0 ? Math.max(...list.map((r) => r.count)) : 1;

    return { list, maxCount };
  }, [filteredCallLogs, salespersons]);

  const funnelStats = useMemo(() => {
    const totalCount = enquiries.length;
    const totalVal = enquiries.reduce((sum, e) => sum + e.value_aed, 0);

    const activeCount = enquiries.filter((e) => e.status === 'Active').length;
    const activeVal = enquiries.filter((e) => e.status === 'Active').reduce((sum, e) => sum + e.value_aed, 0);

    const wonCount = enquiries.filter((e) => e.status === 'Order Received').length;
    const wonVal = enquiries.filter((e) => e.status === 'Order Received').reduce((sum, e) => sum + e.value_aed, 0);

    const lostCount = enquiries.filter((e) => e.status === 'Lost' || e.status === 'Dead' || e.status === 'Cancelled PO').length;
    const lostVal = enquiries.filter((e) => e.status === 'Lost' || e.status === 'Dead' || e.status === 'Cancelled PO').reduce((sum, e) => sum + e.value_aed, 0);

    const holdCount = enquiries.filter((e) => e.status === 'Hold' || e.status === 'Delayed').length;
    const holdVal = enquiries.filter((e) => e.status === 'Hold' || e.status === 'Delayed').reduce((sum, e) => sum + e.value_aed, 0);

    const conversionRate = totalCount > 0 ? Math.round((wonCount / totalCount) * 100) : 0;

    return {
      totalCount,
      totalVal,
      activeCount,
      activeVal,
      wonCount,
      wonVal,
      lostCount,
      lostVal,
      holdCount,
      holdVal,
      conversionRate
    };
  }, [enquiries]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Real-time pipeline analysis, win ratios, and client engagement logs."
        icon={BarChart3}
        badge={{ text: 'Active Workspace', variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
      >
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1.5 flex items-center space-x-2.5 shadow-2xs shrink-0">
          <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <div className="text-right">
            <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-widest block leading-tight">System Date</span>
            <span className="text-xs font-semibold font-mono text-slate-800 dark:text-slate-200">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </PageHeader>

      <PageBody maxWidth="max-w-7xl">

      {/* Follow-Up Radar Command Center Widget */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-600 shadow-2xs">
              <Radar className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 font-sans flex items-center gap-2">
                <span>Follow-Up Radar</span>
                <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase">
                  {followUpItems.length} Total Active
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-sans">
                Scheduled client touchpoints, call backs, and engagement reminders.
              </p>
            </div>
          </div>

          {/* Pill Navigation Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveRadarTab('overdue')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 border cursor-pointer ${
                activeRadarTab === 'overdue'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Overdue</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${activeRadarTab === 'overdue' ? 'bg-rose-700 text-white' : 'bg-rose-200 text-rose-900'}`}>
                {overdueList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveRadarTab('today')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 border cursor-pointer ${
                activeRadarTab === 'today'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Due Today</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${activeRadarTab === 'today' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'}`}>
                {todayList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveRadarTab('upcoming')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-2 border cursor-pointer ${
                activeRadarTab === 'upcoming'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Upcoming</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${activeRadarTab === 'upcoming' ? 'bg-blue-700 text-white' : 'bg-blue-200 text-blue-900'}`}>
                {upcomingList.length}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Items Cards */}
        {activeTabItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeTabItems.map((item) => {
              const relBadge = getRelativeTimeBadge(item.followup_date);
              return (
                <div
                  key={item.id}
                  className="bg-slate-50/70 hover:bg-white border border-slate-200 hover:border-slate-300 p-4 rounded-xl space-y-3 transition duration-150 shadow-2xs hover:shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-slate-900 truncate font-sans" title={item.company_name}>
                          {item.company_name}
                        </h3>
                        {item.contact_name && (
                          <div className="flex items-center space-x-1 text-xs text-slate-500 font-sans mt-0.5">
                            <User className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{item.contact_name}</span>
                          </div>
                        )}
                      </div>

                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shrink-0 ${relBadge.className}`}>
                        {relBadge.text}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono pt-1">
                      {item.enquiry_quote_ref ? (
                        <span className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700">
                          #{item.enquiry_quote_ref}
                        </span>
                      ) : (
                        <span className="bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] text-slate-500">
                          Scheduled Task
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400">
                        Date: {item.followup_date}
                      </span>
                    </div>

                    {/* Note Snippet */}
                    <p className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200/80 line-clamp-2 italic font-sans">
                      "{item.notes}"
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1.5">
                    {item.phone ? (
                      <a
                        href={`tel:${item.phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 transition shadow-2xs cursor-pointer"
                        title={`Call ${item.phone}`}
                      >
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Call</span>
                      </a>
                    ) : (
                      <button
                        onClick={() => {
                          if (onOpenActivityDrawer) {
                            onOpenActivityDrawer({
                              existingLog: item.originalLog,
                              companyId: item.company_id,
                              companyName: item.company_name,
                              contactId: item.contact_id,
                              enquiryId: item.enquiry_id
                            });
                          }
                        }}
                        className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition cursor-pointer"
                        title="Log call (No phone on file)"
                      >
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>Call</span>
                      </button>
                    )}

                    {item.phone ? (
                      <a
                        href={`https://wa.me/${item.phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 py-1.5 px-2 bg-green-50 hover:bg-green-100 border border-green-200 text-green-800 rounded-lg text-xs font-bold flex items-center justify-center space-x-1 transition shadow-2xs cursor-pointer"
                        title={`WhatsApp ${item.phone}`}
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-green-600" />
                        <span>WhatsApp</span>
                      </a>
                    ) : (
                      <button
                        onClick={() => {
                          if (onOpenActivityDrawer) {
                            onOpenActivityDrawer({
                              existingLog: item.originalLog,
                              companyId: item.company_id,
                              companyName: item.company_name,
                              contactId: item.contact_id,
                              enquiryId: item.enquiry_id
                            });
                          }
                        }}
                        className="flex-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium flex items-center justify-center space-x-1 transition cursor-pointer"
                        title="Log WhatsApp (No phone on file)"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        <span>WhatsApp</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (onOpenActivityDrawer) {
                          onOpenActivityDrawer({
                            existingLog: item.originalLog,
                            companyId: item.company_id,
                            companyName: item.company_name,
                            contactId: item.contact_id,
                            enquiryId: item.enquiry_id
                          });
                        }
                      }}
                      className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1 transition shadow-2xs cursor-pointer"
                      title="Log Activity"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>Log</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 font-sans text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="font-semibold text-slate-700">No {activeRadarTab} follow-ups in this queue.</p>
            <p className="text-slate-400 text-[11px] mt-0.5">All client touchpoints for this view are up to date.</p>
          </div>
        )}
      </div>

      {/* 4 Core Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Metric 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 flex items-center space-x-4">
          <div className="p-3.5 bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900/50 rounded-xl text-blue-600 dark:text-blue-400">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Active Pipeline</span>
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-950 dark:text-white block mt-1">
              {formatCurrency(totalPipelineActive)}
            </span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 flex items-center space-x-4">
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-100 dark:border-emerald-900/50 rounded-xl text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Won Proposals</span>
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-950 dark:text-white block mt-1">
              {formatCurrency(totalWon)}
            </span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 flex items-center space-x-4">
          <div className="p-3.5 bg-purple-50 dark:bg-purple-950/50 border border-purple-100 dark:border-purple-900/50 rounded-xl text-purple-600 dark:text-purple-400">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Win Ratio</span>
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-950 dark:text-white block mt-1">
              {winRate}%
            </span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 flex items-center space-x-4">
          <div className={`p-3.5 rounded-xl text-rose-600 dark:text-rose-400 ${overdueFollowups.length > 0 ? 'bg-rose-50 dark:bg-rose-950/50 border border-rose-100 dark:border-rose-900/50' : 'bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium block">Overdue Follow-ups</span>
            <span className="text-2xl font-bold font-mono tracking-tight text-slate-950 dark:text-white block mt-1">
              {overdueFollowups.length}
            </span>
          </div>
        </div>
      </div>

      {/* Performance Analytics & Velocity Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Activity Velocity & Leaderboard */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header with Date Filter Pills */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 font-sans flex items-center gap-2">
                    <span>Activity Velocity & Leaderboard</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-sans">
                    Touchpoint distribution, compliance score & sales rep rankings.
                  </p>
                </div>
              </div>

              {/* Date Filter Pills */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
                {[
                  { id: 'this_week', label: 'This Week' },
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_30_days', label: '30 Days' },
                  { id: 'all', label: 'All Time' }
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActivityTimeFilter(filter.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      activityTimeFilter === filter.id
                        ? 'bg-white text-blue-600 shadow-xs border border-slate-200 font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Compliance Score Gauge Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 rounded-xl p-4 text-white flex items-center justify-between shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-xl text-blue-300">
                  <Gauge className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                    Follow-Up Compliance Score
                  </span>
                  <div className="flex items-baseline space-x-2 mt-0.5">
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {complianceMetrics.rate}%
                    </span>
                    <span className="text-xs text-slate-300 font-sans">
                      ({complianceMetrics.completedScheduled} of {complianceMetrics.totalScheduled} completed on time)
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border inline-flex items-center gap-1 ${
                  complianceMetrics.rate >= 80
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : complianceMetrics.rate >= 50
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {complianceMetrics.rate >= 80 ? 'Optimal' : complianceMetrics.rate >= 50 ? 'Moderate' : 'Needs Focus'}
                </span>
              </div>
            </div>

            {/* Channel Touchpoint Distribution */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Channel Touchpoints ({channelDistribution.total} Total)</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono uppercase">
                  {activityTimeFilter.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="space-y-2">
                {channelDistribution.channels.map((ch) => {
                  const IconComp = ch.icon;
                  return (
                    <div key={ch.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <div className="flex items-center space-x-1.5">
                          <IconComp className={`w-3.5 h-3.5 ${ch.color}`} />
                          <span className="font-medium text-slate-800">{ch.label}</span>
                        </div>
                        <div className="flex items-center space-x-2 font-mono text-[11px]">
                          <span className="font-bold text-slate-800">{ch.count}</span>
                          <span className="text-slate-400">({ch.pct}%)</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${ch.bg}`}
                          style={{ width: `${Math.max(ch.pct, ch.count > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sales Rep Leaderboard */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>Top Sales Rep Activity</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  {salesRepLeaderboard.list.length} Reps Active
                </span>
              </div>

              {salesRepLeaderboard.list.length > 0 ? (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {salesRepLeaderboard.list.slice(0, 5).map((rep, idx) => (
                    <div key={rep.id || `${rep.initials}-${rep.fullName}-${idx}`} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-xl border border-slate-200/60">
                      <div className="flex items-center space-x-2 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold font-mono flex items-center justify-center shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="font-semibold text-slate-800 truncate font-sans">
                          {rep.fullName}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 shrink-0 font-mono text-[11px]">
                        <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-bold">
                          {rep.count} activities
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic py-2 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No activity logged in this timeframe.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Pipeline Conversion Funnel */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-purple-50 border border-purple-200 rounded-xl text-purple-600">
                  <Filter className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 font-sans flex items-center gap-2">
                    <span>Pipeline Conversion Funnel</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-sans">
                    Stage counts, conversion percentages & proposal throughput.
                  </p>
                </div>
              </div>

              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                {funnelStats.conversionRate}% Win Rate
              </span>
            </div>

            {/* Funnel Stage Items */}
            <div className="space-y-3">
              {/* Stage 1: Total Enquiries */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-600" />
                    1. Total Proposals Logged
                  </span>
                  <div className="flex items-center space-x-2 font-mono text-xs">
                    <span className="font-bold text-slate-900">{funnelStats.totalCount} enquiries</span>
                    <span className="text-slate-500">({formatCurrency(funnelStats.totalVal)})</span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div className="bg-slate-700 h-full rounded-full" style={{ width: '100%' }} />
                </div>
              </div>

              {/* Stage 2: Active Pipeline */}
              <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    2. Active In-Progress Pipeline
                  </span>
                  <div className="flex items-center space-x-2 font-mono text-xs">
                    <span className="font-bold text-blue-900">{funnelStats.activeCount} enquiries</span>
                    <span className="text-blue-600 font-semibold">
                      ({funnelStats.totalCount > 0 ? Math.round((funnelStats.activeCount / funnelStats.totalCount) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="w-full bg-blue-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${funnelStats.totalCount > 0 ? (funnelStats.activeCount / funnelStats.totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Stage 3: Orders Won (Converted) */}
              <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    3. Orders Received (Won)
                  </span>
                  <div className="flex items-center space-x-2 font-mono text-xs">
                    <span className="font-bold text-emerald-900">{funnelStats.wonCount} won</span>
                    <span className="text-emerald-700 font-bold">
                      ({formatCurrency(funnelStats.wonVal)})
                    </span>
                  </div>
                </div>
                <div className="w-full bg-emerald-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${funnelStats.totalCount > 0 ? (funnelStats.wonCount / funnelStats.totalCount) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Stage 4: On Hold / Delayed & Lost */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200 text-xs">
                  <span className="text-[11px] font-semibold text-amber-800 block">On Hold / Delayed</span>
                  <div className="flex items-baseline justify-between mt-1 font-mono">
                    <span className="font-bold text-amber-900 text-sm">{funnelStats.holdCount}</span>
                    <span className="text-[11px] text-amber-700 font-medium">{formatCurrency(funnelStats.holdVal)}</span>
                  </div>
                </div>

                <div className="p-2.5 bg-rose-50/60 rounded-xl border border-rose-200 text-xs">
                  <span className="text-[11px] font-semibold text-rose-800 block">Lost / Dead</span>
                  <div className="flex items-baseline justify-between mt-1 font-mono">
                    <span className="font-bold text-rose-900 text-sm">{funnelStats.lostCount}</span>
                    <span className="text-[11px] text-rose-700 font-medium">{formatCurrency(funnelStats.lostVal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Conversion Efficiency Summary Bar */}
            <div className="bg-slate-900 text-white p-3.5 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="font-sans font-medium text-slate-200">
                  Overall Win Conversion: <strong className="text-emerald-400">{funnelStats.conversionRate}%</strong>
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {funnelStats.wonCount} of {funnelStats.totalCount} Closed
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Section - Recharts Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart A: Status breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col lg:col-span-1">
          <h2 className="text-lg font-bold text-slate-850 dark:text-slate-100 mb-4 font-sans flex items-center space-x-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-slate-800 dark:text-slate-200">Pipeline by Status</span>
          </h2>
          <div className="flex-1 min-h-[250px] flex items-center justify-center">
            {statusChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: number) => formatCurrency(val)}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400 font-mono">No status data seeded.</div>
            )}
          </div>
          <div className="mt-4 space-y-2">
            {statusChartData.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-slate-600 font-sans">{d.name}</span>
                </div>
                <span className="font-mono text-slate-800 font-semibold">{formatCurrency(d.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart B: Salesperson Breakdown */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col lg:col-span-1">
          <h2 className="text-lg font-bold text-slate-850 dark:text-slate-100 mb-4 font-sans flex items-center space-x-2">
            <DollarSign className="w-4 h-4 text-blue-600" />
            <span className="text-slate-800 dark:text-slate-200">Value by Salesperson</span>
          </h2>
          <div className="flex-1 min-h-[250px] flex items-center justify-center">
            {salespersonChartData.some((s) => s.value > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={salespersonChartData.filter((s) => s.value > 0)} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="initials" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tickFormatter={formatYAxis} tick={{ fill: '#64748b', fontSize: 10 }} />
                  <Tooltip
                    formatter={(val: number) => formatCurrency(val)}
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }}
                    itemStyle={{ color: '#1e293b' }}
                    labelStyle={{ color: '#475569' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400 font-mono">No active sales value found.</div>
            )}
          </div>
          <div className="mt-4 space-y-2 max-h-[120px] overflow-y-auto">
            {salespersonChartData.slice(0, 4).map((s, idx) => (
              <div key={s.id || `${s.initials}-${s.name}-${idx}`} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 truncate max-w-[150px] font-sans">
                  {s.initials} - {s.name}
                </span>
                <span className="font-mono text-slate-800 font-semibold">{formatCurrency(s.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart C: Product line volume distribution */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col lg:col-span-1">
          <h2 className="text-lg font-bold text-slate-850 dark:text-slate-100 mb-4 font-sans flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-slate-800 dark:text-slate-200">Volume by Product Type</span>
          </h2>
          <div className="flex-1 min-h-[250px] flex items-center justify-center">
            {productTypeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={productTypeChartData} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} />
                  <YAxis dataKey="name" type="category" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 10 }} width={80} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '8px' }}
                    itemStyle={{ color: '#1e293b' }}
                  />
                  <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400 font-mono">No line item product data found.</div>
            )}
          </div>
        </div>
      </div>

      {/* Lower Dashboard Row: Overdue followups List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2 font-sans">
            <AlertTriangle className="w-5 h-5 text-rose-500" />
            <span>Active Follow-up Tasks (Awaiting Response)</span>
          </h2>
          <span className="text-[10px] bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-full font-mono uppercase font-bold">
            Total Overdue: {overdueFollowups.length}
          </span>
        </div>

        {overdueFollowups.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">S/N</th>
                  <th className="py-3 px-4">Company Name</th>
                  <th className="py-3 px-4">Quote Ref</th>
                  <th className="py-3 px-4">Salesperson</th>
                  <th className="py-3 px-4">Next Follow-up</th>
                  <th className="py-3 px-4 text-right">Value</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {overdueFollowups.slice(0, 5).map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50 transition duration-100 group">
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-500">#{e.sn}</td>
                    <td className="py-3.5 px-4 font-sans text-sm font-semibold text-slate-800">
                      {companyMap.get(e.company_id) || 'Unknown Company'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">{e.quote_ref_no}</td>
                    <td className="py-3.5 px-4 font-sans text-xs text-slate-500">{e.sales_person}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-rose-600 font-semibold">{e.next_followup_date}</td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-700 text-right font-bold">
                      {formatCurrency(e.value_aed)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => e.id && onSelectEnquiry(e.id)}
                        className="py-1 px-3 bg-slate-50 hover:bg-slate-900 border border-slate-200 hover:border-slate-900 text-slate-700 hover:text-white rounded-lg text-xs font-semibold font-sans transition duration-150 shadow-sm"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 font-sans text-sm">
            🎉 Clean slate! There are no overdue follow-up tasks waiting.
          </div>
        )}
      </div>
    </PageBody>
  </>
);
}

