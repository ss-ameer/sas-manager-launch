import React, { useState, useEffect } from 'react';
import { Enquiry, Company, Contact, AuditLog, UserProfile, Salesperson, Workspace } from '../types';
import { db } from '../firebase';
import { collection, doc } from 'firebase/firestore';
import { safeUpdateDoc, safeAddDoc } from '../firebase';
import { canEditOrDeleteRecord, isRecordOwner, getUserWorkspaceRole } from '../utils/permissions';
import {
  FileText,
  Building,
  User,
  MapPin,
  Phone,
  Mail,
  ListOrdered,
  Paperclip,
  History,
  RotateCcw,
  Check,
  TrendingUp,
  X,
  ShieldCheck,
  Download,
  Trash2,
  Edit2,
  GitFork,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  ChevronsUpDown
} from 'lucide-react';

interface EnquiryDetailProps {
  enquiry: Enquiry;
  companies: Company[];
  contacts: Contact[];
  auditLogs: AuditLog[];
  salespersons: Salesperson[];
  user: UserProfile;
  enquiries?: Enquiry[];
  activeWorkspace?: Workspace;
  activeWorkspaceId?: string;
  onClose: () => void;
  onDeleteEnquiry: (id: string) => void;
  onEditEnquiry: (enquiry: Enquiry) => void;
  onSelectEnquiry?: (id: string) => void;
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

export default function EnquiryDetail({
  enquiry,
  companies,
  contacts,
  auditLogs,
  salespersons,
  user,
  enquiries = [],
  activeWorkspace,
  activeWorkspaceId,
  onClose,
  onDeleteEnquiry,
  onEditEnquiry,
  onSelectEnquiry,
  onOpenActivityDrawer
}: EnquiryDetailProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'history' | 'revisions'>('details');
  const [reverting, setReverting] = useState(false);
  const [revertSuccess, setRevertSuccess] = useState(false);
  const [isExpandedWidth, setIsExpandedWidth] = useState(false);
  const [expandedItemIndices, setExpandedItemIndices] = useState<Record<number, boolean>>({});

  // Strict Zero-Trust Audit: Force close if workspace changes or mismatch detected
  useEffect(() => {
    const currentWsId = activeWorkspaceId || activeWorkspace?.id;
    if (currentWsId && enquiry.workspace_id && enquiry.workspace_id !== currentWsId) {
      onClose();
    }
  }, [activeWorkspaceId, activeWorkspace?.id, enquiry.workspace_id, onClose]);

  const toggleLineItem = (idx: number) => {
    setExpandedItemIndices((prev) => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const toggleExpandAllItems = () => {
    if (!enquiry.line_items || enquiry.line_items.length === 0) return;
    const allExpanded = enquiry.line_items.every((_, idx) => expandedItemIndices[idx]);
    if (allExpanded) {
      setExpandedItemIndices({});
    } else {
      const nextState: Record<number, boolean> = {};
      enquiry.line_items.forEach((_, idx) => { nextState[idx] = true; });
      setExpandedItemIndices(nextState);
    }
  };

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

  const matchedCompany = companies.find((c) => c.id === enquiry.company_id);
  const matchedContact = contacts.find((c) => c.id === enquiry.contact_id);

  // Compute the chronological list of revisions
  const revisionChain = React.useMemo(() => {
    if (!enquiries || enquiries.length === 0) return [enquiry];

    let root = enquiry;
    const maxDepth = 50;
    let depth = 0;
    while (root.parent_id && depth < maxDepth) {
      const parent = enquiries.find((e) => e.id === root.parent_id);
      if (!parent) break;
      root = parent;
      depth++;
    }

    const rootId = root.id;
    if (!rootId) return [enquiry];

    // Find all linked enquiries sharing this root or having this parent
    const linked = enquiries.filter((e) => e.id === rootId || e.parent_id === rootId);
    if (linked.length === 0) return [enquiry];

    return linked.sort((a, b) => {
      const revA = a.revision_number ?? 0;
      const revB = b.revision_number ?? 0;
      if (revA !== revB) return revA - revB;
      return (a.sn || 0) - (b.sn || 0);
    });
  }, [enquiries, enquiry]);

  const handleCreateRevision = () => {
    const currentWsId = activeWorkspaceId || activeWorkspace?.id;
    if (!currentWsId) {
      alert('Critical Error: Active workspace context lost. Cannot save record.');
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }
    const userRole = getUserWorkspaceRole(user, currentWsId, activeWorkspace);
    if (userRole === 'Viewer') {
      alert('Access Denied: Viewers do not have permission to generate or mutate proposals.');
      return;
    }

    const rootId = enquiry.parent_id || enquiry.id || (enquiry as any)._id;
    if (!rootId) {
      alert('Cannot create revision: Original enquiry ID missing.');
      return;
    }

    // Find all linked revisions
    const linked = (enquiries || []).filter(
      (e) => e.id === rootId || e.parent_id === rootId
    );

    // Calculate next revision number
    const maxExistingRev = linked.reduce(
      (max, e) => Math.max(max, e.revision_number || 0),
      enquiry.revision_number || 0
    );
    const nextRevNumber = maxExistingRev + 1;

    // Clean base quote ref
    const baseQuoteRef = (enquiry.quote_ref_no || '').replace(/-R\d+$/i, '');
    const revisionQuoteRef = `${baseQuoteRef}-R${nextRevNumber}`;

    // Find next SN across enquiries
    const maxSn = (enquiries || []).reduce((max, e) => Math.max(max, e.sn || 0), enquiry.sn || 0);
    const nextSn = maxSn + 1;

    // Clone payload without ID so EnquiryForm creates a NEW enquiry record
    const { id, _id, createdAt, updatedAt, ...clonedData } = enquiry as any;

    const revisionPayload: Enquiry = {
      ...clonedData,
      workspace_id: currentWsId,
      id: undefined,
      parent_id: rootId,
      revision_number: nextRevNumber,
      quote_ref_no: revisionQuoteRef,
      sn: nextSn,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onEditEnquiry(revisionPayload);
    onClose();
  };

  // Filter audit logs for this specific enquiry
  const recordLogs = auditLogs
    .filter((log) => log.document_id === enquiry.id && log.entity_type === 'enquiry')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date().getTime()); // Newest first

  const isBasicTier = user.role !== 'Admin' && user.dataVisibilityTier === 'BASIC';
  const isOwnerOrAttributed = isRecordOwner(user, enquiry);
  const isMaskedForBasic = isBasicTier && !isOwnerOrAttributed;

  const formatCurrency = (val: number) => {
    if (isMaskedForBasic) return 'AED *** (Basic View)';
    const isUSD = enquiry.currency === 'USD';
    const converted = isUSD ? val / 3.6725 : val;
    const symbol = isUSD ? '$' : 'AED ';
    return `${symbol}${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleRevert = async (log: AuditLog) => {
    const currentWsId = activeWorkspaceId || activeWorkspace?.id;
    if (!currentWsId) {
      alert('Critical Error: Active workspace context lost. Cannot save record.');
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }
    const userRole = getUserWorkspaceRole(user, currentWsId, activeWorkspace);
    if (user.role === 'Viewer' || userRole === 'Viewer') {
      alert('Access Denied: Viewers do not have permission to mutate proposals or revert versions.');
      return;
    }

    const performRevert = async () => {
      setReverting(true);
      try {
        // Prepare rolled-back data structure
        const targetState = log.before || log.after; // Roll back to 'before' state of the edit
        if (!targetState) {
          alert('No historic state found in this log.');
          setReverting(false);
          return;
        }

        // Clean out ID if it's there & force tamper-proof active workspace_id
        const { id, updatedAt, createdAt, ...rollbackData } = targetState;
        const finalRollbackPayload = {
          ...rollbackData,
          workspace_id: currentWsId
        };

        await safeUpdateDoc('enquiries', enquiry.id!, finalRollbackPayload);

        // Add rollback audit log
        const auditPayload = {
          document_id: enquiry.id!,
          entity_type: 'enquiry',
          action: 'update',
          changed_by_uid: user.uid,
          changed_by_name: user.username,
          timestamp: new Date().toISOString(),
          before: enquiry,
          after: rollbackData,
          changes: [
            {
              field: 'VERSION_ROLLBACK',
              old_value: `S/N ${enquiry.sn} - State from ${new Date().toLocaleDateString()}`,
              new_value: `State rolled back to ${new Date(log.timestamp).toLocaleDateString()}`
            }
          ]
        };
        await safeAddDoc('audit_logs', auditPayload);

        setRevertSuccess(true);
        setTimeout(() => {
          setRevertSuccess(false);
          window.location.reload(); // Refresh session to pull fresh data
        }, 1500);
      } catch (err: any) {
        alert('Revert failed: ' + err.message);
      } finally {
        setReverting(false);
      }
    };

    setConfirmDialog({
      isOpen: true,
      title: 'Revert Enquiry Changes',
      message: `Do you want to revert this enquiry back to the state of ${new Date(log.timestamp).toLocaleString()}?`,
      confirmText: 'Revert',
      cancelText: 'Cancel',
      isDestructive: false,
      onConfirm: performRevert
    });
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'Order Received':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'Lost':
        return 'bg-rose-50 border-rose-200 text-rose-700';
      case 'Dead':
        return 'bg-slate-100 border-slate-200 text-slate-600';
      case 'Hold':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      case 'Delayed':
        return 'bg-purple-50 border-purple-200 text-purple-700';
      case 'Cancelled PO':
        return 'bg-pink-50 border-pink-200 text-pink-700';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-600';
    }
  };

  return (
    <div id="enquiry-detail-drawer" className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex justify-end">
      <div className={`w-full ${isExpandedWidth ? 'max-w-6xl lg:max-w-7xl' : 'max-w-3xl lg:max-w-4xl'} bg-white border-l border-slate-200 h-screen flex flex-col shadow-2xl relative transition-all duration-300 animate-in slide-in-from-right`}>
        
        {/* Header Block */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono bg-slate-50 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md font-bold">
              #{enquiry.sn}
            </span>
            <h3 className="text-xl font-bold text-slate-900 font-sans truncate max-w-[320px] md:max-w-[480px]">
              {matchedCompany?.display_name || 'Unassigned Account'}
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenActivityDrawer && (
              <button
                type="button"
                onClick={() => {
                  onOpenActivityDrawer({
                    companyId: matchedCompany?.id || enquiry.company_id,
                    companyName: matchedCompany?.display_name,
                    contactId: matchedContact?.id || enquiry.contact_id,
                    enquiryId: enquiry.id || enquiry.quote_ref_no || String(enquiry.sn)
                  });
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer mr-1"
                title="Log Quick Activity (Call, WhatsApp, Meeting, Site Visit)"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Log Activity</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleCreateRevision}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-sm transition cursor-pointer mr-1"
              title="Create a new quote revision (clones line items, links, currency & value)"
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>📄 + Create Revision</span>
            </button>
            <button
              type="button"
              onClick={() => setIsExpandedWidth(!isExpandedWidth)}
              className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition mr-1"
              title={isExpandedWidth ? "Compress drawer width" : "Expand full width"}
            >
              {isExpandedWidth ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            {canEditOrDeleteRecord(user, enquiry) && (
              <button
                type="button"
                onClick={() => {
                  onEditEnquiry(enquiry);
                  onClose();
                }}
                className="p-1.5 hover:bg-blue-50 text-blue-500 hover:text-blue-700 rounded-lg transition"
                title="Edit Enquiry"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            )}
            {canEditOrDeleteRecord(user, enquiry) && (
              <button
                type="button"
                onClick={() => {
                  const targetId = enquiry.id || (enquiry as any)._id;
                  if (!targetId) {
                    alert('Error: Enquiry ID is missing. Cannot delete.');
                    return;
                  }
                  setConfirmDialog({
                    isOpen: true,
                    title: 'Delete Enquiry',
                    message: `Are you sure you want to delete Enquiry #${enquiry.sn}? This action is irreversible.`,
                    confirmText: 'Delete',
                    cancelText: 'Cancel',
                    isDestructive: true,
                    onConfirm: () => {
                      onDeleteEnquiry(targetId);
                      onClose();
                    }
                  });
                }}
                className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition cursor-pointer"
                title="Delete Enquiry"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-6 border-b border-slate-100 flex space-x-6 text-sm">
          {(['details', 'items', 'history', 'revisions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 font-semibold capitalize font-sans relative flex items-center space-x-1.5 ${
                activeTab === tab ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{tab === 'items' ? 'Line Items' : tab}</span>
              {tab === 'revisions' && revisionChain.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                  activeTab === 'revisions' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {revisionChain.length}
                </span>
              )}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Panel Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {revertSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 flex items-center space-x-3 font-sans text-sm animate-pulse">
              <Check className="w-5 h-5 shrink-0 text-emerald-600" />
              <span>Record rolled back successfully! Resetting session...</span>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-6">
              {/* Status and Value Header Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border flex flex-col justify-between ${getStatusStyle(enquiry.status)}`}>
                  <span className="text-[10px] font-mono uppercase tracking-widest opacity-60">Status Code</span>
                  <span className="text-base font-bold font-sans mt-1">{enquiry.status}</span>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Total Package Price</span>
                  <span className="text-base font-bold font-mono text-blue-600 mt-1">{formatCurrency(enquiry.value_aed)}</span>
                </div>
              </div>

              {/* Revision History Chain Card */}
              {revisionChain.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <GitFork className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-mono text-slate-500 uppercase tracking-widest font-bold">
                        Proposal Revision Chain ({revisionChain.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('revisions')}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-sans font-semibold hover:underline cursor-pointer"
                    >
                      View Detailed Chain →
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {revisionChain.map((rev, idx) => {
                      const isCurrent = rev.id === enquiry.id;
                      const revLabel = rev.revision_number ? `Rev ${rev.revision_number}` : (idx === 0 ? 'Original' : `Rev ${idx}`);
                      return (
                        <button
                          key={rev.id || idx}
                          type="button"
                          onClick={() => {
                            if (!isCurrent && onSelectEnquiry && rev.id) {
                              onSelectEnquiry(rev.id);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 transition cursor-pointer ${
                            isCurrent
                              ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                          }`}
                        >
                          <span>{rev.quote_ref_no || `Ref #${rev.sn}`}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            isCurrent ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {revLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Company switchboard metadata */}
              {matchedCompany && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3">
                  <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest flex items-center space-x-2">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    <span>Company switchboard</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                    <div className="flex items-center space-x-2 text-slate-700">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{matchedCompany.city}, {matchedCompany.country}</span>
                    </div>
                    {matchedCompany.general_email && (
                      <div className="flex items-center space-x-2 text-slate-700 overflow-hidden">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{matchedCompany.general_email}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Personal Contact card */}
              {matchedContact && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3.5">
                  <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest flex items-center space-x-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Contact Person</span>
                  </h4>
                  <div className="space-y-1">
                    <span className="text-sm font-semibold text-slate-800 block font-sans">{matchedContact.full_name}</span>
                    <span className="text-[10px] text-slate-500 block font-sans">{matchedContact.designation || 'Project Manager'}</span>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center gap-4 text-xs font-sans text-slate-600 border-t border-slate-200 pt-2.5">
                    {matchedContact.mobile && (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{matchedContact.mobile}</span>
                      </div>
                    )}
                    {matchedContact.email && (
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{matchedContact.email}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Engagement details */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3">
                <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Identifiers & Dates</h4>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">Quote Ref</span>
                    <span className="text-slate-800 font-semibold font-mono">{enquiry.quote_ref_no}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">Sales Representative</span>
                    <span className="text-slate-800 font-semibold font-sans">
                      {(() => {
                        const sp = salespersons.find(s => s.id === enquiry.sales_person || s.initials === enquiry.sales_person);
                        return sp ? sp.full_name : enquiry.sales_person;
                      })()}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">Project Country</span>
                    <span className="text-slate-800 font-semibold font-sans">{enquiry.country}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">Enquiry Source</span>
                    <span className="text-slate-800 font-semibold font-sans">{enquiry.enquiry_source}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">Estimated Order Date</span>
                    <span className="text-slate-800 font-semibold font-mono">{enquiry.projected_order_date || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">Next Follow-up</span>
                    <span className="text-slate-800 font-semibold font-mono">{enquiry.next_followup_date || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">Received Date</span>
                    <span className="text-slate-800 font-semibold font-mono">{enquiry.enquiry_date}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-mono text-[10px]">System Created Date</span>
                    <span className="text-slate-800 font-semibold font-mono text-slate-500">
                      {enquiry.createdAt ? new Date(enquiry.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-1.5">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-widest block">Remarks & Progress Logs</span>
                <p className="text-sm text-slate-700 leading-relaxed font-sans font-medium whitespace-pre-line">
                  {enquiry.remarks || 'No progress remarks documented for this enquiry yet.'}
                </p>
              </div>

              {/* Invoice details */}
              {(enquiry.invoice_po_no || enquiry.payment_status) && (
                <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-3">
                  <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Commercial Logs</h4>
                  <div className="grid grid-cols-2 gap-4 text-xs font-sans">
                    {enquiry.invoice_po_no && (
                      <div>
                        <span className="text-slate-400 uppercase font-mono text-[10px] block">Invoice PO #</span>
                        <span className="text-slate-800 font-semibold font-mono">{enquiry.invoice_po_no}</span>
                      </div>
                    )}
                    {enquiry.payment_status && (
                      <div>
                        <span className="text-slate-400 uppercase font-mono text-[10px] block">Payment status</span>
                        <span className="text-slate-800 font-semibold">{enquiry.payment_status}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {enquiry.attachments && enquiry.attachments.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">Source Proposal Attachments</h4>
                  {enquiry.attachments.map((file, idx) => (
                    <div
                      key={idx}
                      className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-xs font-mono text-slate-700"
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="truncate font-semibold">{file.name}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-150 rounded-lg text-slate-500 hover:text-slate-800 transition flex items-center justify-center shadow-sm"
                        title="Download Proposal Document"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
                  <ListOrdered className="w-4 h-4" />
                  <span>Multi-Product proposal line item breakdown</span>
                </div>
                {enquiry.line_items && enquiry.line_items.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleExpandAllItems}
                    className="text-[11px] font-mono text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 py-1 px-2.5 bg-blue-50/60 hover:bg-blue-50 rounded-lg border border-blue-100 transition"
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5" />
                    <span>
                      {enquiry.line_items.every((_, idx) => expandedItemIndices[idx])
                        ? 'Collapse All'
                        : 'Expand All'}
                    </span>
                  </button>
                )}
              </div>

              {enquiry.line_items && enquiry.line_items.length > 0 ? (
                <div className="space-y-3">
                  {enquiry.line_items.map((item, idx) => {
                    const isExpanded = !!expandedItemIndices[idx];
                    const hasAttrs = item.attributes && item.attributes.length > 0;
                    return (
                      <div
                        key={idx}
                        className={`bg-slate-50 border transition-all duration-200 rounded-xl overflow-hidden ${
                          isExpanded ? 'border-blue-300 shadow-xs bg-slate-50/90' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Collapsed Header Bar - Clickable to toggle */}
                        <div
                          onClick={() => toggleLineItem(idx)}
                          className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-slate-100/70 transition"
                        >
                          <div className="flex items-center space-x-3 truncate pr-2">
                            <div className="text-slate-400 hover:text-slate-600 shrink-0">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-blue-600" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </div>
                            <span className="text-xs bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded font-mono font-bold shrink-0">
                              Line #{idx + 1}
                            </span>
                            {item.item_type === 'charge' || item.item_type === 'discount' || item.product_type === 'Service / Charge' ? (
                              <span className="text-xs bg-amber-50 border border-amber-200 text-amber-800 font-bold px-2 py-0.5 rounded font-mono flex items-center gap-1 shrink-0">
                                <span>Charge:</span> {item.charge_type || item.product_type}
                              </span>
                            ) : (
                              <span className="text-sm font-bold text-slate-800 font-sans truncate">{item.product_type}</span>
                            )}
                            {item.option && (
                              <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 font-mono font-bold px-1.5 py-0.5 rounded shrink-0">
                                {item.option}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center space-x-4 shrink-0 font-mono">
                            <span className="text-xs text-slate-500 hidden sm:inline-block">
                              {item.quantity} {item.unit} x {formatCurrency(item.unit_price)}
                            </span>
                            <span className="text-sm font-bold text-blue-600">
                              {formatCurrency(item.total_price)}
                            </span>
                          </div>
                        </div>

                        {/* Inline Expanded View */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-200/80 bg-white">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-sans pt-1">
                              <div>
                                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Quantity & Pricing</span>
                                <span className="font-semibold text-slate-800 font-mono">
                                  {item.quantity} {item.unit} @ {formatCurrency(item.unit_price)} = {formatCurrency(item.total_price)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">Delivery / Lead Time</span>
                                <span className="font-semibold text-slate-700 font-mono">
                                  {item.lead_time_note || 'Immediate / Stock'}
                                </span>
                              </div>
                            </div>

                            {item.description && (
                              <div>
                                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Description / Spec Notes</span>
                                <p className="text-xs text-slate-700 leading-relaxed font-sans font-medium whitespace-pre-line bg-slate-50 p-3 rounded-lg border border-slate-150">
                                  {item.description}
                                </p>
                              </div>
                            )}

                            {hasAttrs && (
                              <div>
                                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">Specification Attributes</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {item.attributes.map((attr, attrIdx) => (
                                    <span key={attrIdx} className="text-[11px] font-mono bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-md shadow-2xs">
                                      <span className="font-semibold text-slate-900">{attr.key}:</span> {attr.value || '—'}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans text-sm">
                  This enquiry does not have any declared line item details.
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono border-b border-slate-100 pb-2 mb-2">
                <History className="w-4 h-4" />
                <span>Enquiry Revision Registry & Audit trail</span>
              </div>

              {recordLogs.length > 0 ? (
                <div className="space-y-4">
                  {recordLogs.map((log) => (
                    <div key={log.id} className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-4">
                      
                      {/* Log meta */}
                      <div className="flex items-center justify-between border-b border-slate-150 pb-2.5">
                        <div className="space-y-0.5">
                          <span className="text-xs text-slate-800 font-semibold block font-sans">
                            {log.changed_by_name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>

                        {/* Rollback option */}
                        {user.role !== 'Viewer' && (
                          <button
                            type="button"
                            onClick={() => handleRevert(log)}
                            disabled={reverting}
                            className="py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold font-sans transition flex items-center space-x-1.5 shadow-sm"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Rollback</span>
                          </button>
                        )}
                      </div>

                      {/* Log edits */}
                      {log.changes && log.changes.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Modified properties:</span>
                          {log.changes.map((diff, idx) => (
                            <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1 font-mono">
                              <span className="text-blue-600 font-semibold block">{diff.field}</span>
                              <div className="flex flex-col space-y-0.5 text-[11px] text-slate-500 pl-2 border-l border-slate-100">
                                <span className="line-through text-slate-400 shrink-0">
                                  Was: {typeof diff.old_value === 'object' ? JSON.stringify(diff.old_value) : String(diff.old_value || 'none')}
                                </span>
                                <span className="text-emerald-600 font-semibold shrink-0">
                                  Is: {typeof diff.new_value === 'object' ? JSON.stringify(diff.new_value) : String(diff.new_value || 'none')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-slate-400 italic block">
                          Initial entry creation log
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans text-sm">
                  This enquiry does not have any revision history records yet.
                </div>
              )}
            </div>
          )}

          {activeTab === 'revisions' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono border-b border-slate-100 pb-2 mb-2">
                <GitFork className="w-4 h-4 text-blue-500" />
                <span>Sequential Sheet Revisions Chain</span>
              </div>

              {revisionChain.length > 0 ? (
                <div className="relative border-l border-slate-200 ml-3.5 pl-5 space-y-5 py-2">
                  {revisionChain.map((rev, index) => {
                    const isCurrent = rev.id === enquiry.id;
                    const revCompany = companies.find((c) => c.id === rev.company_id);
                    const revDate = rev.enquiry_date;
                    const itemsCount = rev.line_items?.length || (rev as any).items?.length || 0;
                    const revLabel = typeof rev.revision_number === 'number' ? (rev.revision_number === 0 ? 'Original' : `Rev ${rev.revision_number}`) : (index === 0 ? 'Original' : `Rev ${index}`);
                    
                    return (
                      <div key={rev.id || index} className="relative group">
                        {/* Timeline point indicator */}
                        <div className={`absolute -left-[27px] top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white transition-all ${
                          isCurrent 
                            ? 'border-blue-600 ring-4 ring-blue-100 scale-110 z-10' 
                            : 'border-slate-300 group-hover:border-slate-400'
                        }`} />

                        <div 
                          onClick={() => {
                            if (!isCurrent && onSelectEnquiry && rev.id) {
                              onSelectEnquiry(rev.id);
                            }
                          }}
                          className={`border rounded-xl p-4 transition-all text-left ${
                            isCurrent
                              ? 'bg-blue-50/50 border-blue-200 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono font-bold text-slate-800 flex items-center space-x-1.5">
                              <span>Quote Ref: {rev.quote_ref_no || `#${rev.sn}`}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold">
                                {revLabel}
                              </span>
                            </span>
                            <div className="flex items-center space-x-2">
                              {isCurrent && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider font-sans">
                                  Viewing
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono">
                                S/N: #{rev.sn}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-sans mb-3 text-slate-600">
                            <div>
                              <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Proposal Date</span>
                              <span className="font-medium text-slate-800 font-mono">{revDate}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Package Value</span>
                              <span className="font-bold text-blue-600 font-mono">{formatCurrency(rev.value_aed)}</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Company</span>
                              <span className="font-medium truncate block max-w-[150px] text-slate-800">
                                {revCompany?.display_name || 'Unknown Company'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-mono text-slate-400 block tracking-wider">Line Items</span>
                              <span className="font-medium text-slate-800">
                                {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] border-t border-slate-100 pt-2 text-slate-400 font-mono">
                            <span>
                              {rev.updatedByUsername ? `Updated by ${rev.updatedByUsername}` : 'Initial revision'}
                            </span>
                            <span>
                              {rev.updatedAt ? new Date(rev.updatedAt).toLocaleDateString() : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans text-sm">
                  No linked sheet revisions are available for this record.
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Custom Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
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
    </div>
  );
}
