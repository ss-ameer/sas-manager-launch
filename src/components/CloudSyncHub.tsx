import React, { useState, useRef, useEffect } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  Database,
  FileJson,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  HardDrive,
  ShieldCheck,
  Clock,
  AlertCircle,
  Trash2,
  Activity,
  Wifi,
  WifiOff
} from 'lucide-react';
import {
  Company,
  Contact,
  Enquiry,
  CallLogEntry,
  AuditLog,
  Product,
  Salesperson,
  DropdownOption,
  UserProfile,
  Workspace
} from '../types';
import { syncEngine } from '../services/SyncEngine';
import { saveToLocalStore } from '../services/db';
import { safeSetDoc, safeAddDoc } from '../firebase';

export interface SyncErrorEntry {
  id: string;
  timestamp: string;
  collection: string;
  message: string;
  operation: string;
}

interface CloudSyncHubProps {
  companies: Company[];
  contacts: Contact[];
  enquiries: Enquiry[];
  callLogs?: CallLogEntry[];
  auditLogs?: AuditLog[];
  products: Product[];
  salespersons: Salesperson[];
  enquirySources: DropdownOption[];
  productCategories: DropdownOption[];
  units: DropdownOption[];
  user: UserProfile;
  activeWorkspace?: Workspace;
  setCompanies: (data: Company[]) => void;
  setContacts: (data: Contact[]) => void;
  setEnquiries: (data: Enquiry[]) => void;
  setCallLogs?: (data: CallLogEntry[]) => void;
  setAuditLogs?: (data: AuditLog[]) => void;
  setProducts: (data: Product[]) => void;
  setSalespersons: (data: Salesperson[]) => void;
  setEnquirySources: (data: DropdownOption[]) => void;
  setProductCategories: (data: DropdownOption[]) => void;
  setUnits: (data: DropdownOption[]) => void;
  realtimeSyncEnabled: boolean;
  setRealtimeSyncEnabled: (enabled: boolean) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function CloudSyncHub({
  companies = [],
  contacts = [],
  enquiries = [],
  callLogs = [],
  auditLogs = [],
  products = [],
  salespersons = [],
  enquirySources = [],
  productCategories = [],
  units = [],
  user,
  activeWorkspace,
  setCompanies,
  setContacts,
  setEnquiries,
  setCallLogs,
  setAuditLogs,
  setProducts,
  setSalespersons,
  setEnquirySources,
  setProductCategories,
  setUnits,
  showToast
}: CloudSyncHubProps) {
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // SyncEngine Subscription State
  const [engineStatus, setEngineStatus] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null as Date | null,
    error: null as string | null
  });

  useEffect(() => {
    return syncEngine.subscribe((status) => {
      setEngineStatus(status);
    });
  }, []);

  // Diagnostic Logs
  const [syncErrors, setSyncErrors] = useState<SyncErrorEntry[]>(() => {
    try {
      const raw = localStorage.getItem('omni_sync_errors');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const clearSyncErrors = () => {
    setSyncErrors([]);
    localStorage.removeItem('omni_sync_errors');
    showToast('Diagnostic error logs cleared', 'info');
  };

  // JSON Offline Export
  const handleExportJson = () => {
    const dataSnapshot = {
      exportDate: new Date().toISOString(),
      appVersion: '0.36.0',
      companies,
      contacts,
      enquiries,
      callLogs,
      auditLogs,
      products,
      salespersons,
      enquirySources,
      productCategories,
      units
    };

    const blob = new Blob([JSON.stringify(dataSnapshot, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `OmniSuite_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Full JSON workspace backup generated', 'success');
  };

  // JSON Import with Active Workspace Remapping
  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        
        // Target active workspace ID to prevent hidden legacy workspace IDs
        const targetWsId = activeWorkspace?.id || user?.defaultWorkspaceId || 'ws_default';

        let remappedCompanies: Company[] = [];
        let remappedContacts: Contact[] = [];
        let remappedEnquiries: Enquiry[] = [];
        let remappedCallLogs: CallLogEntry[] = [];
        let remappedProducts: Product[] = [];
        let remappedSalespersons: Salesperson[] = [];

        if (Array.isArray(parsed.companies)) {
          remappedCompanies = parsed.companies.map((c: any) => ({ ...c, workspace_id: targetWsId }));
          setCompanies(remappedCompanies);
        }
        if (Array.isArray(parsed.contacts)) {
          remappedContacts = parsed.contacts.map((c: any) => ({ ...c, workspace_id: targetWsId }));
          setContacts(remappedContacts);
        }
        if (Array.isArray(parsed.enquiries)) {
          remappedEnquiries = parsed.enquiries.map((enq: any) => ({ ...enq, workspace_id: targetWsId }));
          setEnquiries(remappedEnquiries);
        }
        if (Array.isArray(parsed.callLogs) && setCallLogs) {
          remappedCallLogs = parsed.callLogs.map((l: any) => ({ ...l, workspace_id: targetWsId }));
          setCallLogs(remappedCallLogs);
          localStorage.setItem('omni_call_logs', JSON.stringify(remappedCallLogs));
          saveToLocalStore('call_logs', remappedCallLogs);
        }
        if (Array.isArray(parsed.auditLogs) && setAuditLogs) {
          setAuditLogs(parsed.auditLogs);
          localStorage.setItem('omni_audit_logs', JSON.stringify(parsed.auditLogs));
          saveToLocalStore('audit_logs', parsed.auditLogs);
        }
        if (Array.isArray(parsed.products)) {
          remappedProducts = parsed.products.map((p: any) => ({ ...p, workspace_id: targetWsId }));
          setProducts(remappedProducts);
        }
        if (Array.isArray(parsed.salespersons)) {
          remappedSalespersons = parsed.salespersons.map((s: any) => ({ ...s, workspace_id: targetWsId }));
          setSalespersons(remappedSalespersons);
        }
        if (Array.isArray(parsed.enquirySources)) setEnquirySources(parsed.enquirySources);
        if (Array.isArray(parsed.productCategories)) setProductCategories(parsed.productCategories);
        if (Array.isArray(parsed.units)) setUnits(parsed.units);

        // Save remapped items to Firestore collections
        const saveItemsToFirestore = async (collectionName: string, items: any[]) => {
          for (const item of items) {
            const itemToSave = {
              ...item,
              workspace_id: item.workspace_id || activeWorkspace?.id || 'ws_default'
            };
            if (itemToSave.id) {
              await safeSetDoc(collectionName, itemToSave.id, itemToSave);
            } else {
              await safeAddDoc(collectionName, itemToSave);
            }
          }
        };

        if (remappedCompanies.length > 0) await saveItemsToFirestore('companies', remappedCompanies);
        if (remappedContacts.length > 0) await saveItemsToFirestore('contacts', remappedContacts);
        if (remappedEnquiries.length > 0) await saveItemsToFirestore('enquiries', remappedEnquiries);
        if (remappedProducts.length > 0) await saveItemsToFirestore('products', remappedProducts);
        if (remappedSalespersons.length > 0) await saveItemsToFirestore('salespersons', remappedSalespersons);
        if (remappedCallLogs.length > 0) await saveItemsToFirestore('call_logs', remappedCallLogs);

        showToast('Local state restored & remapped to active workspace successfully', 'success');
      } catch (err: any) {
        showToast(`Invalid JSON file format: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = '';
  };

  const handleManualFlush = async () => {
    showToast('Flushing pending write queue to Firestore...', 'info');
    await syncEngine.processQueue();
    showToast('Sync queue processing cycle finished', 'success');
  };

  // Filter metrics strictly by active workspace ID
  const wsId = activeWorkspace?.id;
  const filteredCompanies = wsId ? companies.filter((c) => (c.workspace_id || (c as any).workspaceId) === wsId) : companies;
  const filteredContacts = wsId ? contacts.filter((c) => (c.workspace_id || (c as any).workspaceId) === wsId) : contacts;
  const filteredEnquiries = wsId ? enquiries.filter((e) => (e.workspace_id || (e as any).workspaceId) === wsId) : enquiries;
  const filteredProducts = wsId ? products.filter((p) => (p.workspace_id || (p as any).workspaceId) === wsId) : products;
  const filteredSalespersons = wsId ? salespersons.filter((s) => (s.workspace_id || (s as any).workspaceId) === wsId) : salespersons;
  const filteredActivityLogs = wsId ? callLogs.filter((l) => (l.workspace_id || (l as any).workspaceId) === wsId) : callLogs;

  return (
    <>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="relative flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
        title="Open System Health & Cloud Sync Hub"
      >
        <Activity className={`w-3.5 h-3.5 ${engineStatus.isSyncing ? 'text-amber-400 animate-spin' : engineStatus.isOnline ? 'text-emerald-400' : 'text-slate-400'}`} />
        <span className="hidden sm:inline">System Health</span>
        {engineStatus.pendingCount > 0 && (
          <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {engineStatus.pendingCount} pending
          </span>
        )}
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    System Health & Connectivity
                    <span className="text-[10px] uppercase tracking-widest font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                      v0.57.0
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Local-first sync engine with write-ahead mutation queue
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Online / Queue Status Banner */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border flex items-center space-x-3 ${engineStatus.isOnline ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-slate-800/80 border-slate-700 text-slate-300'}`}>
                  {engineStatus.isOnline ? <Wifi className="w-5 h-5 text-emerald-400 shrink-0" /> : <WifiOff className="w-5 h-5 text-slate-400 shrink-0" />}
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider">Connection State</div>
                    <div className="text-sm font-semibold mt-0.5">
                      {engineStatus.isOnline ? 'Online (Connected to Firestore)' : 'Offline (Operating in Local Mode)'}
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border bg-slate-800/50 border-slate-800 text-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Write Queue</div>
                      <div className="text-sm font-semibold mt-0.5">
                        {engineStatus.pendingCount === 0 ? 'Queue Empty (Fully Synced)' : `${engineStatus.pendingCount} Pending Mutations`}
                      </div>
                    </div>
                  </div>
                  {engineStatus.pendingCount > 0 && (
                    <button
                      onClick={handleManualFlush}
                      disabled={engineStatus.isSyncing}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                    >
                      {engineStatus.isSyncing ? 'Syncing...' : 'Flush Now'}
                    </button>
                  )}
                </div>
              </div>

              {/* Entity Summary Grid */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span>Local Memory Cache Diagnostics ({activeWorkspace?.name || 'Active Workspace'})</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400">Companies</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">{filteredCompanies.length}</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400">Contacts</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">{filteredContacts.length}</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400">Enquiries</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">{filteredEnquiries.length}</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400">Activity Logs</div>
                    <div className="text-lg font-bold text-blue-400 font-mono mt-0.5">{filteredActivityLogs.length}</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400">Products</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">{filteredProducts.length}</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-xs text-slate-400">Team Roster</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">{filteredSalespersons.length}</div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg col-span-2 sm:col-span-1">
                    <div className="text-xs text-slate-400">Dropdown Configs</div>
                    <div className="text-lg font-bold text-white font-mono mt-0.5">
                      {enquirySources.length + productCategories.length + units.length}
                    </div>
                  </div>
                </div>
              </div>

              {/* JSON Export / Import Hub */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                  <FileJson className="w-4 h-4 text-emerald-400" />
                  <span>Workspace Data Backup & Restoration</span>
                </h4>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    onClick={handleExportJson}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Workspace Backup JSON</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Restore From Backup JSON</span>
                  </button>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleImportJson}
                    accept=".json"
                    className="hidden"
                  />
                </div>
              </div>

              {/* Sync Errors Log */}
              {syncErrors.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center space-x-2">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Diagnostic Sync Error Log ({syncErrors.length})</span>
                    </h4>
                    <button
                      onClick={clearSyncErrors}
                      className="text-xs text-rose-400 hover:underline flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Clear</span>
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {syncErrors.map((err) => (
                      <div key={err.id} className="p-2.5 rounded-lg bg-slate-950/60 text-xs font-mono text-slate-300 border border-rose-500/20">
                        <span className="text-rose-400 font-bold">[{err.collection}]</span> {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Close Diagnostic Hub
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
