import React, { useState } from 'react';
import { Enquiry, Company, Salesperson, getInitials } from '../types';
import { BRAND_CONFIG } from '../config';
import {
  FileText,
  Search,
  Plus,
  Download,
  Upload,
  Calendar,
  Filter,
  ArrowUpDown,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  UserCheck,
  X,
  RotateCw,
  Check,
  ArrowRight,
  Trash,
  ChevronDown
} from 'lucide-react';
import { db } from '../firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';
import { isRecordOwner, canEditOrDeleteRecord } from '../utils/permissions';

interface EnquiryListProps {
  enquiries: Enquiry[];
  companies: Company[];
  salespersons: Salesperson[];
  onSelectEnquiry: (id: string) => void;
  onAddEnquiry: () => void;
  onEditEnquiry: (enquiry: Enquiry) => void;
  onDeleteEnquiry: (id: string) => void;
  onBulkDeleteEnquiries: (ids: string[]) => void;
  user: any;
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

export default function EnquiryList({
  enquiries,
  companies,
  salespersons,
  onSelectEnquiry,
  onAddEnquiry,
  onEditEnquiry,
  onDeleteEnquiry,
  onBulkDeleteEnquiries,
  user,
  onOpenMobileMenu,
  onOpenActivityDrawer
}: EnquiryListProps) {
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [salesPersonFilter, setSalesPersonFilter] = useState<string>('All');
  const [urgencyFilter, setUrgencyFilter] = useState<'All' | 'Overdue'>('All');

  // Debounce search input updates to eliminate typing lag
  React.useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 150);
    return () => clearTimeout(handler);
  }, [searchInput]);

  // Bulk deletion multi-select state
  const [selectedEnquiryIds, setSelectedEnquiryIds] = useState<string[]>([]);

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number | 'All'>(50);

  // Reset page to 1 when filters change to prevent empty states
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, salesPersonFilter, urgencyFilter]);

  // Excel/CSV Advanced Column-Mapping Preview Importer state
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStep, setImportStep] = useState<'input' | 'preview'>('input');
  const [parsedRows, setParsedRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [columnMappings, setColumnMappings] = useState<{
    sn: number;
    quote_ref: number;
    date: number;
    sales_person: number;
    client: number;
    value: number;
  }>({ sn: 0, quote_ref: 1, date: 2, sales_person: 3, client: 4, value: -1 });

  // Format currency based on the individual enquiry's native currency choice
  const formatEnquiryCurrency = (e: Enquiry) => {
    const isUSD = e.currency === 'USD';
    const val = isUSD ? e.value_aed / 3.6725 : e.value_aed;
    const symbol = isUSD ? '$' : 'AED ';
    return `${symbol}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Cycle lists and helpers
  const statuses = ['All', 'Active', 'Order Received', 'Lost', 'Dead', 'Hold', 'Delayed', 'Cancelled PO'];
  const salespersonOptions = React.useMemo(() => {
    return ['All', ...salespersons.map((s) => s.initials)];
  }, [salespersons]);

  const cycleStatus = () => {
    const currentIndex = statuses.indexOf(statusFilter);
    const nextIndex = (currentIndex + 1) % statuses.length;
    setStatusFilter(statuses[nextIndex]);
  };

  const cycleSalesPerson = () => {
    const currentIndex = salespersonOptions.indexOf(salesPersonFilter);
    const nextIndex = (currentIndex + 1) % salespersonOptions.length;
    setSalesPersonFilter(salespersonOptions[nextIndex]);
  };
  
  // Sort State
  const [sortField, setSortField] = useState<'sn' | 'enquiry_date' | 'value_aed'>('sn');
  const [sortAsc, setSortAsc] = useState(false);

  const isEditable = user.role !== 'Viewer';

  const companyMap = React.useMemo(() => {
    return new Map(companies.map((c) => [c.id, c.display_name]));
  }, [companies]);

  const handleSort = (field: 'sn' | 'enquiry_date' | 'value_aed') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Filter & Sort Logic
  const filteredEnquiries = React.useMemo(() => {
    const isOwnDataOnly = user.role !== 'Admin' && user.dataVisibilityScope === 'OWN_DATA_ONLY';

    return enquiries
      .filter((e) => {
        // -1. Ignore soft-deleted records in main view
        if (e.is_deleted) return false;

        // 0. Scope Check
        if (isOwnDataOnly && !isRecordOwner(user, e)) return false;

        // 1. Search Query
        const q = searchQuery.toLowerCase();
        const compName = (companyMap.get(e.company_id) || '').toLowerCase();
        const ref = e.quote_ref_no.toLowerCase();
        const matchText = compName.includes(q) || ref.includes(q) || e.sn.toString().includes(q);

        // 2. Status
        const matchStatus = statusFilter === 'All' || e.status === statusFilter;

        // 3. Salesperson
        const matchRep = salesPersonFilter === 'All' || (() => {
          const sp = salespersons.find(s => s.id === salesPersonFilter || s.initials === salesPersonFilter);
          if (!sp) return e.sales_person === salesPersonFilter;
          return e.sales_person === sp.id || e.sales_person === sp.initials;
        })();

        // 4. Urgency (Overdue followups)
        const today = new Date().toISOString().split('T')[0];
        const matchUrgency =
          urgencyFilter === 'All' ||
          (e.status === 'Active' && e.next_followup_date && e.next_followup_date < today);

        return matchText && matchStatus && matchRep && matchUrgency;
      })
      .sort((a, b) => {
        let comparison = 0;
        if (sortField === 'sn') {
          comparison = a.sn - b.sn;
        } else if (sortField === 'enquiry_date') {
          comparison = a.enquiry_date.localeCompare(b.enquiry_date);
        } else if (sortField === 'value_aed') {
          comparison = a.value_aed - b.value_aed;
        }
        return sortAsc ? comparison : -comparison;
      });
  }, [enquiries, searchQuery, statusFilter, salesPersonFilter, urgencyFilter, sortField, sortAsc, companyMap]);

  // Calculate pagination details
  const totalItems = filteredEnquiries.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const paginatedEnquiries = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEnquiries.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEnquiries, currentPage, itemsPerPage]);

  // Export Flattened CSV (Section 4.6 requirement)
  const handleExportCSV = () => {
    if (enquiries.length === 0) return;

    // Header array
    const headers = [
      'S/N',
      'Quote Ref No',
      'Enquiry Date',
      'Sales Person',
      'Client Company',
      'Country',
      'Location',
      'Source',
      'Status',
      'Product Type',
      'Item Description',
      'Qty',
      'Unit',
      'Unit Price',
      'Total Price',
      'Lead Time',
      'Total Package AED',
      'Invoice PO',
      'Payment Status',
      'Remarks'
    ];

    const rows: string[][] = [];

    enquiries.forEach((e) => {
      const compName = companyMap.get(e.company_id) || 'Unknown';
      if (e.line_items && e.line_items.length > 0) {
        e.line_items.forEach((item) => {
          rows.push([
            e.sn.toString(),
            e.quote_ref_no,
            e.enquiry_date,
            e.sales_person,
            compName,
            e.country,
            e.project_location,
            e.enquiry_source,
            e.status,
            item.product_type,
            item.description.replace(/"/g, '""'), // Escape quotes
            item.quantity.toString(),
            item.unit,
            item.unit_price.toString(),
            item.total_price.toString(),
            item.lead_time_note || '—',
            e.value_aed.toString(),
            e.invoice_po_no || '—',
            e.payment_status || '—',
            (e.remarks || '').replace(/\n/g, ' ').replace(/"/g, '""')
          ]);
        });
      } else {
        rows.push([
          e.sn.toString(),
          e.quote_ref_no,
          e.enquiry_date,
          e.sales_person,
          compName,
          e.country,
          e.project_location,
          e.enquiry_source,
          e.status,
          '—',
          '—',
          '0',
          'Nos',
          '0',
          '0',
          '—',
          e.value_aed.toString(),
          e.invoice_po_no || '—',
          e.payment_status || '—',
          (e.remarks || '').replace(/\n/g, ' ').replace(/"/g, '""')
        ]);
      }
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((cell) => `"${cell}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${BRAND_CONFIG.shortName}_Enquiries_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Parsing pasted clipboard raw tab/comma CSV text
  const handleParseImportText = () => {
    if (!importText.trim()) return;
    const lines = importText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const separator = importText.includes('\t') ? '\t' : ',';
    const parsed: string[][] = [];

    lines.forEach((line) => {
      let parts: string[] = [];
      if (separator === '\t') {
        parts = line.split('\t').map((p) => p.replace(/^"|"$/g, '').trim());
      } else {
        parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^"|"$/g, '').trim());
      }
      parsed.push(parts);
    });

    if (parsed.length > 0) {
      setParsedRows(parsed);
      // Try to intelligently detect mapping indices if first row looks like a header
      const headers = parsed[0];
      const map = { sn: 0, quote_ref: 1, date: 2, sales_person: 3, client: 4, value: -1 };
      
      headers.forEach((h, idx) => {
        const low = h.toLowerCase().trim();
        if (low.includes('s/n') || low.includes('sn') || low.includes('serial')) map.sn = idx;
        else if (low.includes('quote') || low.includes('ref') || low.includes('reference')) map.quote_ref = idx;
        else if (low.includes('date') || low.includes('listed') || low.includes('received') || low.includes('log')) map.date = idx;
        else if (low.includes('sales') || low.includes('person') || low.includes('rep') || low.includes('initials')) map.sales_person = idx;
        else if (low.includes('client') || low.includes('company') || low.includes('customer') || low.includes('account')) map.client = idx;
        else if (low.includes('value') || low.includes('aed') || low.includes('price') || low.includes('amount')) map.value = idx;
      });
      setColumnMappings(map);
      setImportStep('preview');
    }
  };

  // Advanced Excel/CSV Confirmed Multi-Record Importer
  const handleBulkImport = async () => {
    const startIndex = hasHeader ? 1 : 0;
    if (parsedRows.length <= startIndex) {
      alert('No data rows to import!');
      return;
    }

    try {
      const batch = writeBatch(db);
      const rowsToProcess = parsedRows.slice(startIndex);

      for (let i = 0; i < rowsToProcess.length; i++) {
        const parts = rowsToProcess[i];
        if (parts.length === 0) continue;

        // Map SN
        const snVal = Number(parts[columnMappings.sn]);
        const snNum = isNaN(snVal) ? 3000 + i : snVal;

        // Map Quote Ref
        const quoteRef = parts[columnMappings.quote_ref] || `${snNum}-2026`;

        // Map Date
        const dateStr = parts[columnMappings.date] || new Date().toISOString().split('T')[0];

        // Map Rep initials
        const spInitials = parts[columnMappings.sales_person] || 'NS';

        // Map Client name
        const clientText = parts[columnMappings.client] || `${BRAND_CONFIG.shortName} ${BRAND_CONFIG.defaultClientName}`;

        // Map Value (AED)
        let valNum = 0;
        if (columnMappings.value !== -1 && parts[columnMappings.value]) {
          const rawVal = parts[columnMappings.value].replace(/[^0-9.]/g, '');
          const parsedValue = Number(rawVal);
          valNum = isNaN(parsedValue) ? 0 : parsedValue;
        }

        // Check if company is known
        const comp = companies.find(
          (c) => c.canonical_name.toLowerCase() === clientText.toLowerCase() || c.aliases.some((a) => a.toLowerCase() === clientText.toLowerCase())
        );
        const cId = comp?.id || 'comp_ionex'; // fall back to preloaded general client account

        const record: Enquiry = {
          sn: snNum,
          enquiry_date: dateStr,
          sales_person: spInitials,
          company_id: cId,
          country: 'UAE',
          project_location: 'Sharjah',
          enquiry_source: 'Email',
          status: 'Active',
          quote_ref_no: quoteRef,
          value_aed: valNum,
          line_items: []
        };

        const docRef = doc(collection(db, 'enquiries'));
        batch.set(docRef, record);
      }

      await batch.commit();
      alert(`Import complete! Successfully parsed and imported ${rowsToProcess.length} rows.`);
      setShowImport(false);
      setImportStep('input');
      setImportText('');
      window.location.reload();
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 shadow-2xs';
      case 'Order Received':
        return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 shadow-2xs';
      case 'Lost':
        return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/60 shadow-2xs';
      case 'Dead':
        return 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 shadow-2xs';
      case 'Hold':
        return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 shadow-2xs';
      case 'Delayed':
        return 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 shadow-2xs';
      case 'Cancelled PO':
        return 'bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200/80 dark:border-pink-800/60 shadow-2xs';
      default:
        return 'bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 shadow-2xs';
    }
  };

  return (
    <>
      <PageHeader
        title="Enquiries Registry"
        subtitle={`Maintain ${BRAND_CONFIG.shortName} sales proposals, track delivery lead times, and update customer status.`}
        icon={FileText}
        badge={{ text: `${enquiries.length} Proposals`, variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={
          isEditable
            ? {
                label: 'Add Enquiry',
                icon: Plus,
                onClick: onAddEnquiry
              }
            : undefined
        }
        secondaryActions={[
          ...(user.role === 'Admin'
            ? [
                {
                  label: 'Import Legacy Log',
                  icon: Upload,
                  onClick: () => setShowImport(true)
                }
              ]
            : []),
          {
            label: 'Export flattened CSV',
            icon: Download,
            onClick: handleExportCSV
          }
        ]}
      />

      <PageBody maxWidth="max-w-7xl">

      {/* Structured Filtering Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 text-xs font-mono text-slate-400 uppercase tracking-wider mb-2">
          <Filter className="w-4 h-4" />
          <span>Faceted Search & Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Text search */}
          <div className="relative md:col-span-4">
            <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by SN, quote reference, account name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {/* Status selector (Split Dropdown + Cycle) */}
          <div className="md:col-span-3">
            <div className="relative flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-xl shadow-sm h-11 w-full transition">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="appearance-none w-full bg-transparent pl-4 pr-12 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Order Received">Order Received</option>
                <option value="Lost">Lost</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Invoiced">Invoiced</option>
              </select>
              <ChevronDown className="absolute right-12 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              
              <div className="h-6 w-[1px] bg-slate-200 absolute right-9" />
              
              <button
                onClick={cycleStatus}
                type="button"
                className="absolute right-0 h-full w-9 flex items-center justify-center hover:bg-slate-50 rounded-r-xl text-slate-400 hover:text-slate-600 transition"
                title="Cycle status filter"
              >
                <RotateCw className="w-3.5 h-3.5 hover:rotate-45 transition-transform" />
              </button>
            </div>
          </div>

          {/* Salesperson selector (Split Dropdown + Cycle) */}
          <div className="md:col-span-3">
            <div className="relative flex items-center bg-white border border-slate-200 hover:border-slate-300 rounded-xl shadow-sm h-11 w-full transition">
              <select
                value={salesPersonFilter}
                onChange={(e) => setSalesPersonFilter(e.target.value)}
                className="appearance-none w-full bg-transparent pl-4 pr-12 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer h-full font-sans"
              >
                <option value="All">All Reps</option>
                {salespersons.map((s, idx) => (
                  <option key={s.id || `${s.initials}-${s.full_name}-${idx}`} value={s.id || s.initials}>
                    {(s.initials || getInitials(s.full_name))} - {s.full_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-12 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              
              <div className="h-6 w-[1px] bg-slate-200 absolute right-9" />
              
              <button
                onClick={cycleSalesPerson}
                type="button"
                className="absolute right-0 h-full w-9 flex items-center justify-center hover:bg-slate-50 rounded-r-xl text-slate-400 hover:text-slate-600 transition"
                title="Cycle salesperson filter"
              >
                <RotateCw className="w-3.5 h-3.5 hover:rotate-45 transition-transform" />
              </button>
            </div>
          </div>

          {/* Urgency follow-up toggle (Cycling Filter) */}
          <div className="md:col-span-2">
            <button
              onClick={() => setUrgencyFilter(urgencyFilter === 'All' ? 'Overdue' : 'All')}
              className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 border rounded-xl text-sm font-semibold transition shadow-sm h-11 ${
                urgencyFilter === 'Overdue'
                  ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500'
              }`}
              title="Click to toggle overdue followups filter"
            >
              <span className="text-xs">
                {urgencyFilter === 'Overdue' ? '● Overdue Only' : 'Overdue filter'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Table Layout */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        {filteredEnquiries.length > 0 ? (
          <>
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 select-none bg-slate-50/50 dark:bg-slate-950/50">
                  <th className="py-4 px-6 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={paginatedEnquiries.length > 0 && paginatedEnquiries.every((e) => selectedEnquiryIds.includes(e.id!))}
                      onChange={(e) => {
                        const pageIds = paginatedEnquiries.map((eq) => eq.id!).filter(Boolean);
                        if (e.target.checked) {
                          setSelectedEnquiryIds((prev) => {
                            const union = [...prev];
                            pageIds.forEach((id) => {
                              if (!union.includes(id)) union.push(id);
                            });
                            return union;
                          });
                        } else {
                          setSelectedEnquiryIds((prev) => prev.filter((id) => !pageIds.includes(id)));
                        }
                      }}
                      className="rounded border-slate-200 text-slate-900 focus:ring-slate-900 cursor-pointer"
                      title="Select all on current page"
                    />
                  </th>
                  <th onClick={() => handleSort('sn')} className="py-4 px-6 cursor-pointer hover:text-slate-800 transition">
                    <div className="flex items-center space-x-1">
                      <span>S/N</span>
                      <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                    </div>
                  </th>
                  <th className="py-4 px-6">Company Account</th>
                  <th className="py-4 px-6">Quote Ref No</th>
                  <th className="py-4 px-6">Rep</th>
                  <th onClick={() => handleSort('enquiry_date')} className="py-4 px-6 cursor-pointer hover:text-slate-800 transition">
                    <div className="flex items-center space-x-1">
                      <span>Received Date</span>
                      <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                    </div>
                  </th>
                  <th className="py-4 px-6">Next Follow-up</th>
                  <th className="py-4 px-6">Status Badge</th>
                  <th onClick={() => handleSort('value_aed')} className="py-4 px-6 cursor-pointer hover:text-slate-800 transition text-right">
                    <div className="flex items-center space-x-1 justify-end">
                      <span>Enquiry Value</span>
                      <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                    </div>
                  </th>
                  <th className="py-4 px-6 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-sans">
                {paginatedEnquiries.map((e) => {
                  const companyName = companyMap.get(e.company_id) || 'Unknown Client';
                  const todayStr = new Date().toISOString().split('T')[0];
                  const isOverdue = e.status === 'Active' && e.next_followup_date && e.next_followup_date < todayStr;
                  const isChecked = selectedEnquiryIds.includes(e.id!);

                  return (
                    <tr
                      key={e.id}
                      className={`hover:bg-slate-50/50 transition duration-100 group ${
                        isChecked ? 'bg-slate-50/70 font-medium' : ''
                      }`}
                    >
                      <td className="py-4 px-6 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(chk) => {
                            if (chk.target.checked) {
                              setSelectedEnquiryIds((prev) => [...prev, e.id!]);
                            } else {
                              setSelectedEnquiryIds((prev) => prev.filter((id) => id !== e.id!));
                            }
                          }}
                          className="rounded border-slate-200 text-slate-900 focus:ring-slate-900 cursor-pointer"
                        />
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-slate-500 dark:text-slate-400 font-semibold">#{e.sn}</td>
                      <td className="py-4 px-6 font-semibold text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                        {companyName}
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-slate-600 dark:text-slate-300">{e.quote_ref_no}</td>
                      <td className="py-4 px-6 text-xs text-slate-500 dark:text-slate-400 font-semibold font-mono">
                        {(() => {
                          const sp = salespersons.find((s) => s.id === e.sales_person || s.initials === e.sales_person);
                          return sp ? (sp.initials || getInitials(sp.full_name)) : e.sales_person;
                        })()}
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-slate-500 dark:text-slate-400">{e.enquiry_date}</td>
                      <td className="py-4 px-6 font-mono text-xs">
                        {isOverdue ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center space-x-1">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{e.next_followup_date}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">{e.next_followup_date || '—'}</span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase ${getStatusBadgeClass(e.status)}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 font-mono text-xs text-slate-800 dark:text-slate-200 text-right font-bold">
                        {formatEnquiryCurrency(e)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center space-x-2.5">
                          <button
                            onClick={() => e.id && onSelectEnquiry(e.id)}
                            className="py-1 px-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-900 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 hover:border-slate-900 text-slate-700 dark:text-slate-200 hover:text-white rounded-lg text-xs font-semibold font-sans transition flex items-center shadow-sm"
                          >
                            Details
                          </button>
                          {isEditable && (
                            <button
                              onClick={() => onEditEnquiry(e)}
                              className="py-1 px-2.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition"
                            >
                              Edit
                            </button>
                          )}
                          {isEditable && (
                            <button
                              onClick={() => {
                                const targetId = e.id || (e as any)._id;
                                if (!targetId) {
                                  alert('Error: Enquiry ID is missing. Cannot delete.');
                                  return;
                                }
                                setConfirmDialog({
                                  isOpen: true,
                                  title: 'Delete Enquiry',
                                  message: `Are you sure you want to delete Enquiry #${e.sn}? This is irreversible.`,
                                  confirmText: 'Delete',
                                  cancelText: 'Cancel',
                                  isDestructive: true,
                                  onConfirm: () => onDeleteEnquiry(targetId)
                                });
                              }}
                              className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination Controls */}
          {totalItems > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 gap-4">
              <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Showing <span className="font-bold text-slate-950 dark:text-slate-100">{Math.min((currentPage - 1) * (itemsPerPage === 'All' ? totalItems : itemsPerPage) + 1, totalItems)}</span> to{' '}
                <span className="font-bold text-slate-950 dark:text-slate-100">{Math.min(currentPage * (itemsPerPage === 'All' ? totalItems : itemsPerPage), totalItems)}</span> of{' '}
                <span className="font-bold text-slate-950 dark:text-slate-100">{totalItems}</span> enquiries
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Items per page Selector */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Show:</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      const val = e.target.value;
                      setItemsPerPage(val === 'All' ? 'All' : Number(val));
                      setCurrentPage(1);
                    }}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value="All">All</option>
                  </select>
                </div>

                {totalPages > 1 && itemsPerPage !== 'All' && (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                      title="First Page"
                    >
                      <ChevronsLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                      title="Previous Page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <span className="text-xs font-mono px-3 text-slate-500 dark:text-slate-400">
                      Page <span className="font-bold text-slate-950 dark:text-slate-100">{currentPage}</span> of{' '}
                      <span className="font-bold text-slate-950 dark:text-slate-100">{totalPages}</span>
                    </span>

                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                      title="Next Page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
                      title="Last Page"
                    >
                      <ChevronsRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="py-24 text-center text-slate-400 font-sans">
            No enquiries matched your filter conditions in this log.
          </div>
        )}
      </div>

      {/* MODAL: EXCEL IMPORT CONSOLE (PREVIEW AND MAPPING SUPPORT) */}
      {showImport && (
        <div id="import-form-modal" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-8 shadow-2xl relative space-y-6 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setShowImport(false);
                setImportStep('input');
                setImportText('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 pb-3 border-b border-slate-200">
              <Upload className="w-6 h-6 text-blue-600" />
              <h3 className="text-xl font-bold text-slate-900 font-sans">Advanced Excel Columns Importer</h3>
            </div>

            {importStep === 'input' ? (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-normal font-sans space-y-2">
                  <span className="font-bold text-slate-800 block">How to Import:</span>
                  <p>
                    Paste columns copied directly from your Excel sheet or a standard CSV log. You can separate columns using **tabs** or **commas**.
                  </p>
                  <label className="flex items-center space-x-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(e) => setHasHeader(e.target.checked)}
                      className="rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="font-semibold text-slate-700">First row represents the headers of columns</span>
                  </label>
                </div>

                <div className="space-y-4">
                  <textarea
                    rows={8}
                    placeholder={`S/N	Quote Ref No	Received Date	Sales Person	Client Company	AED Value
1990	1963-020124	2024-01-02	PV	Ionex Industrial	145000
1991	1964-020124	2024-01-03	NS	Astraea Water Solutions	72000`}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-3 px-4 text-xs font-mono text-slate-800 placeholder:text-slate-300 focus:outline-none"
                  />

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setShowImport(false)}
                      className="w-1/2 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 font-medium rounded-xl text-xs transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleParseImportText}
                      disabled={!importText.trim()}
                      className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition disabled:opacity-50 shadow-sm"
                    >
                      Next: Map & Preview Columns
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-normal space-y-3">
                  <span className="font-bold text-slate-800 block uppercase font-mono text-[10px]">Map Columns to Fields:</span>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">S/N</label>
                      <select
                        value={columnMappings.sn}
                        onChange={(e) => setColumnMappings({ ...columnMappings, sn: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Quote Ref</label>
                      <select
                        value={columnMappings.quote_ref}
                        onChange={(e) => setColumnMappings({ ...columnMappings, quote_ref: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Received Date</label>
                      <select
                        value={columnMappings.date}
                        onChange={(e) => setColumnMappings({ ...columnMappings, date: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Sales Person</label>
                      <select
                        value={columnMappings.sales_person}
                        onChange={(e) => setColumnMappings({ ...columnMappings, sales_person: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Client Company</label>
                      <select
                        value={columnMappings.client}
                        onChange={(e) => setColumnMappings({ ...columnMappings, client: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-slate-400 uppercase mb-1">Package Value</label>
                      <select
                        value={columnMappings.value}
                        onChange={(e) => setColumnMappings({ ...columnMappings, value: Number(e.target.value) })}
                        className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white font-sans"
                      >
                        <option value={-1}>-- No Value (AED 0) --</option>
                        {parsedRows[0]?.map((_, idx) => (
                          <option key={idx} value={idx}>Col {idx + 1} ({parsedRows[0][idx] || 'Empty'})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest block">Live Confirmation Preview (First 5 Rows):</span>
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-[11px] font-sans">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono text-slate-400 uppercase">
                          <th className="p-2">S/N</th>
                          <th className="p-2">Quote Ref</th>
                          <th className="p-2">Date</th>
                          <th className="p-2">Rep</th>
                          <th className="p-2">Company Name Match</th>
                          <th className="p-2 text-right">Value (AED)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {parsedRows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 5).map((parts, rowIdx) => {
                          const snVal = parts[columnMappings.sn];
                          const quoteRef = parts[columnMappings.quote_ref];
                          const dateVal = parts[columnMappings.date];
                          const repVal = parts[columnMappings.sales_person];
                          const clientText = parts[columnMappings.client];
                          
                          let rawVal = 0;
                          if (columnMappings.value !== -1 && parts[columnMappings.value]) {
                            rawVal = Number(parts[columnMappings.value].replace(/[^0-9.]/g, ''));
                          }

                          const matchedComp = companies.find(
                            (c) => c.canonical_name.toLowerCase() === (clientText || '').toLowerCase() || c.aliases.some((a) => a.toLowerCase() === (clientText || '').toLowerCase())
                          );

                          return (
                            <tr key={rowIdx} className="hover:bg-slate-50/50">
                              <td className="p-2 font-mono font-semibold">#{snVal || 'Auto'}</td>
                              <td className="p-2 font-mono">{quoteRef || '—'}</td>
                              <td className="p-2 font-mono">{dateVal || '—'}</td>
                              <td className="p-2 font-mono">{repVal || '—'}</td>
                              <td className="p-2">
                                {matchedComp ? (
                                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                    ✓ {matchedComp.display_name}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">
                                    Default {BRAND_CONFIG.shortName} Client
                                  </span>
                                )}
                              </td>
                              <td className="p-2 font-mono text-right font-semibold">
                                {rawVal.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => setImportStep('input')}
                    className="w-1/3 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium rounded-xl text-xs transition"
                  >
                    Back to text
                  </button>
                  <button
                    onClick={handleBulkImport}
                    className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-md flex items-center justify-center space-x-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm & Import {parsedRows.length - (hasHeader ? 1 : 0)} Records</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FLOATING BULK DELETION ACTION BAR */}
      {selectedEnquiryIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-950 text-white rounded-2xl shadow-2xl py-3 px-5 border border-slate-800 flex items-center space-x-6 animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-300">
              Selected <span className="text-white font-bold bg-slate-800 px-2 py-0.5 rounded font-mono">{selectedEnquiryIds.length}</span> enquiries
            </span>
          </div>
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setSelectedEnquiryIds([])}
              className="py-1 px-3 bg-transparent border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold font-sans transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: 'Bulk Delete Enquiries',
                  message: `Are you sure you want to delete ALL ${selectedEnquiryIds.length} selected enquiries? This is absolutely permanent.`,
                  confirmText: 'Delete All',
                  cancelText: 'Cancel',
                  isDestructive: true,
                  onConfirm: () => {
                    onBulkDeleteEnquiries(selectedEnquiryIds);
                    setSelectedEnquiryIds([]);
                  }
                });
              }}
              className="py-1 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold font-sans transition flex items-center space-x-1 shadow-sm"
            >
              <Trash className="w-3.5 h-3.5" />
              <span>Delete Selected</span>
            </button>
          </div>
        </div>
      )}

      {/* Custom Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-6">{confirmDialog.message}</p>
            <div className="flex items-center justify-end space-x-3 font-sans">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer ${
                  confirmDialog.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageBody>
  </>
);
}
