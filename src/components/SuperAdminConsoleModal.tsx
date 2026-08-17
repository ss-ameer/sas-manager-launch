import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  Download,
  Upload,
  Trash2,
  Copy,
  FolderInput,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  RefreshCw,
  Building2,
  Layers,
  Edit3,
  Crown,
  Users,
  ShieldCheck,
  ShieldX,
  UserX,
  ShieldAlert,
  User
} from 'lucide-react';
import { Workspace } from '../types';
import {
  getUnassignedDocs,
  getOrphanedDocs,
  exportTargetedJson,
  importToStagingBuffer,
  purgeOrphanedData,
  bulkReassignDocs,
  bulkDeleteDocs,
  duplicateDoc,
  TARGET_COLLECTIONS,
  ALL_BROWSER_COLLECTIONS,
  TargetCollectionName,
  StagingOrphanedDocsResult,
  renameWorkspace,
  changeWorkspaceOwner,
  cascadeDeleteWorkspace,
  getAllGlobalUsers,
  getAllGodModeWorkspaces,
  toggleUserSuperAdmin,
  deleteUserAndScrub
} from '../services/SuperAdminEngine';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface SuperAdminConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
}

type ViewTab = 'workspaces' | 'users' | 'staging' | 'orphaned' | 'raw_browser';

export const SuperAdminConsoleModal: React.FC<SuperAdminConsoleModalProps> = ({
  isOpen,
  onClose,
  workspaces
}) => {
  const [activeTab, setActiveTab] = useState<ViewTab>('workspaces');
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Data states
  const [godModeWorkspaces, setGodModeWorkspaces] = useState<Workspace[]>(workspaces || []);
  const [unassignedData, setUnassignedData] = useState<StagingOrphanedDocsResult | null>(null);
  const [orphanedData, setOrphanedData] = useState<StagingOrphanedDocsResult | null>(null);
  const [globalUsers, setGlobalUsers] = useState<Array<{ id: string; [key: string]: any }>>([]);
  const [rawCollectionData, setRawCollectionData] = useState<any[]>([]);
  const [selectedRawCollection, setSelectedRawCollection] = useState<TargetCollectionName>('companies');

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');

  // Multi-selection state
  const [selectedDocKeys, setSelectedDocKeys] = useState<Set<string>>(new Set());

  // Modal Sub-states
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportScope, setExportScope] = useState<'workspace' | 'orphaned' | 'unassigned'>('workspace');
  const [exportWsId, setExportWsId] = useState<string>('');
  const [exportColName, setExportColName] = useState<string>('all');

  const [showReassignModal, setShowReassignModal] = useState(false);
  const [targetWsId, setTargetWsId] = useState<string>('unassigned');
  const [reassignMode, setReassignMode] = useState<'shallow' | 'cascade'>('shallow');
  const [reassignTargetDocs, setReassignTargetDocs] = useState<Array<{ _collection: string; id: string }>>([]);

  const [showPurgeConfirm, setShowPurgeConfirm] = useState(false);

  // Workspace Action Modals
  const [showRenameWsModal, setShowRenameWsModal] = useState(false);
  const [renameWsTarget, setRenameWsTarget] = useState<Workspace | null>(null);
  const [newWsName, setNewWsName] = useState('');

  const [showChangeOwnerModal, setShowChangeOwnerModal] = useState(false);
  const [changeOwnerTarget, setChangeOwnerTarget] = useState<Workspace | null>(null);
  const [selectedNewOwnerUid, setSelectedNewOwnerUid] = useState<string>('');

  const [showCascadeWipeWsModal, setShowCascadeWipeWsModal] = useState(false);
  const [cascadeWipeTarget, setCascadeWipeTarget] = useState<Workspace | null>(null);
  const [confirmWsNameInput, setConfirmWsNameInput] = useState('');

  // User Action Modals
  const [showDeleteUserModal, setShowDeleteUserModal] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<{ id: string; email?: string; full_name?: string } | null>(null);

  // Initial Data Refresh
  const loadData = async () => {
    setLoading(true);
    setStatusMsg(null);
    try {
      const allWsDocs = await getAllGodModeWorkspaces();
      const allWs = allWsDocs.map((d) => ({ id: d.id, ...d } as Workspace));
      setGodModeWorkspaces(allWs);
      if (allWs.length > 0 && !exportWsId) {
        setExportWsId(allWs[0].id);
      }

      const unassigned = await getUnassignedDocs();
      const orphaned = await getOrphanedDocs();
      const usersList = await getAllGlobalUsers();
      setUnassignedData(unassigned);
      setOrphanedData(orphaned);
      setGlobalUsers(usersList);

      if (activeTab === 'raw_browser') {
        const snap = await getDocs(collection(db, selectedRawCollection));
        setRawCollectionData(snap.docs.map((d) => ({ id: d.id, _collection: selectedRawCollection, ...d.data() })));
      }
    } catch (err: any) {
      console.error('SuperAdminConsole load error:', err);
      setStatusMsg({ text: `Error loading data: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, activeTab, selectedRawCollection]);

  // Handle Workspace Rename
  const handleExecuteRenameWorkspace = async () => {
    if (!renameWsTarget || !newWsName.trim()) return;
    setLoading(true);
    try {
      await renameWorkspace(renameWsTarget.id, newWsName.trim());
      setStatusMsg({
        text: `Successfully renamed workspace '${renameWsTarget.name}' to '${newWsName.trim()}'!`,
        type: 'success'
      });
      setShowRenameWsModal(false);
      setRenameWsTarget(null);
      setNewWsName('');
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: `Rename failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Workspace Owner Change
  const handleExecuteChangeOwner = async () => {
    if (!changeOwnerTarget || !selectedNewOwnerUid) return;
    const newOwnerObj = globalUsers.find((u) => u.id === selectedNewOwnerUid);
    if (!newOwnerObj) return;

    setLoading(true);
    try {
      await changeWorkspaceOwner(changeOwnerTarget.id, {
        uid: newOwnerObj.id,
        email: newOwnerObj.email || '',
        full_name: newOwnerObj.full_name || newOwnerObj.username
      });
      setStatusMsg({
        text: `Successfully updated owner of '${changeOwnerTarget.name}' to ${newOwnerObj.full_name || newOwnerObj.email}!`,
        type: 'success'
      });
      setShowChangeOwnerModal(false);
      setChangeOwnerTarget(null);
      setSelectedNewOwnerUid('');
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: `Change owner failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Workspace Cascade Wipe
  const handleExecuteCascadeWipe = async () => {
    if (!cascadeWipeTarget) return;
    if (confirmWsNameInput.trim() !== cascadeWipeTarget.name.trim()) {
      setStatusMsg({ text: 'Workspace name confirmation does not match.', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const res = await cascadeDeleteWorkspace(cascadeWipeTarget.id);
      setStatusMsg({
        text: `Permanently cascade wiped workspace '${cascadeWipeTarget.name}' and ${res.deletedCount} associated record(s)!`,
        type: 'success'
      });
      setShowCascadeWipeWsModal(false);
      setCascadeWipeTarget(null);
      setConfirmWsNameInput('');
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: `Cascade wipe failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Toggle Super Admin Status
  const handleToggleSuperAdmin = async (userId: string, currentStatus: boolean, email?: string) => {
    const cleanEmail = (email || '').toLowerCase().trim();
    if (cleanEmail === 'sibuma.syedameer@gmail.com') {
      setStatusMsg({
        text: 'The master account (sibuma.syedameer@gmail.com) permanently retains Super Admin privileges.',
        type: 'info'
      });
      return;
    }

    setLoading(true);
    try {
      await toggleUserSuperAdmin(userId, currentStatus);
      setStatusMsg({
        text: `Super Admin status ${!currentStatus ? 'GRANTED' : 'REVOKED'} for user ID: ${userId}`,
        type: 'success'
      });
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: `Toggle Super Admin failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete User & Scrub
  const handleExecuteDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setLoading(true);
    try {
      const res = await deleteUserAndScrub(deleteUserTarget.id, deleteUserTarget.email);
      setStatusMsg({
        text: `Permanently deleted user profile '${deleteUserTarget.email || deleteUserTarget.id}' and scrubbed ${res.deletedCount} related record(s)!`,
        type: 'success'
      });
      setShowDeleteUserModal(false);
      setDeleteUserTarget(null);
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: `Delete user failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle JSON Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setStatusMsg(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await importToStagingBuffer(json);
      setStatusMsg({
        text: `Successfully imported ${res.count} records into Staging Buffer (Unassigned)!`,
        type: 'success'
      });
      await loadData();
    } catch (err: any) {
      console.error('Import error:', err);
      setStatusMsg({ text: `Failed to import JSON: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  // Handle Reassign Execute
  const handleExecuteReassign = async () => {
    if (reassignTargetDocs.length === 0) return;
    setLoading(true);
    try {
      await bulkReassignDocs(reassignTargetDocs, targetWsId, reassignMode);
      setStatusMsg({
        text: `Successfully reassigned ${reassignTargetDocs.length} record(s) to workspace '${targetWsId}' (${reassignMode} mode)!`,
        type: 'success'
      });
      setShowReassignModal(false);
      setSelectedDocKeys(new Set());
      await loadData();
    } catch (err: any) {
      console.error('Reassign error:', err);
      setStatusMsg({ text: `Reassign failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Purge Orphaned
  const handleExecutePurge = async () => {
    setLoading(true);
    try {
      const res = await purgeOrphanedData();
      setStatusMsg({
        text: `Successfully purged ${res.deletedCount} orphaned document(s) from database!`,
        type: 'success'
      });
      setShowPurgeConfirm(false);
      await loadData();
    } catch (err: any) {
      console.error('Purge error:', err);
      setStatusMsg({ text: `Purge failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Single Doc Duplicate
  const handleDuplicate = async (col: string, id: string) => {
    setLoading(true);
    try {
      const newId = await duplicateDoc(col, id);
      setStatusMsg({ text: `Duplicated document in ${col} with new ID: ${newId}`, type: 'success' });
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: `Duplicate failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Hard Delete Single
  const handleDeleteSingle = async (col: string, id: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete document ${id} from ${col}?`)) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, col, id));
      setStatusMsg({ text: `Permanently deleted ${id} from ${col}`, type: 'success' });
      await loadData();
    } catch (err: any) {
      setStatusMsg({ text: `Delete failed: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Selection toggle helpers
  const toggleDocSelection = (key: string) => {
    const next = new Set(selectedDocKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedDocKeys(next);
  };

  const getFilteredDocsForCurrentTab = useMemo(() => {
    let sourceDocs: any[] = [];

    if (activeTab === 'staging' && unassignedData) {
      sourceDocs =
        collectionFilter === 'all'
          ? unassignedData.allFlat
          : (unassignedData as any)[collectionFilter] || [];
    } else if (activeTab === 'orphaned' && orphanedData) {
      sourceDocs =
        collectionFilter === 'all'
          ? orphanedData.allFlat
          : (orphanedData as any)[collectionFilter] || [];
    } else if (activeTab === 'raw_browser') {
      sourceDocs = rawCollectionData;
    }

    if (!searchQuery.trim()) return sourceDocs;
    const q = searchQuery.toLowerCase().trim();
    return sourceDocs.filter((d) => {
      const str = JSON.stringify(d).toLowerCase();
      return str.includes(q);
    });
  }, [activeTab, unassignedData, orphanedData, rawCollectionData, searchQuery, collectionFilter]);

  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return globalUsers;
    const q = userSearchQuery.toLowerCase().trim();
    return globalUsers.filter((u) => {
      const name = (u.full_name || u.username || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const id = (u.id || '').toLowerCase();
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [globalUsers, userSearchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-2 md:p-6 text-slate-100 font-sans animate-fade-in">
      <div className="flex flex-col w-full h-full max-w-[1600px] bg-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
        {/* Banner Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 bg-gradient-to-r from-amber-950/80 via-slate-900 to-purple-950/80 border-b border-purple-500/30">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-purple-600 rounded-xl shadow-lg shadow-purple-500/20 text-slate-950 font-black">
              <Zap className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold bg-gradient-to-r from-amber-400 via-amber-200 to-purple-300 bg-clip-text text-transparent">
                  ⚡ GOD MODE - DATABASE STUDIO & STAGING BUFFER
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Direct Firestore Management • Cross-Workspace Reassignment • Staging Buffer • Cascade Cleanup
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center space-x-3 text-xs">
            <div className="px-3 py-1.5 bg-slate-800/80 border border-emerald-500/30 rounded-lg text-emerald-400 font-medium flex items-center space-x-2">
              <Building2 className="w-4 h-4" />
              <span>Workspaces: {godModeWorkspaces.length}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-800/80 border border-purple-500/30 rounded-lg text-purple-300 font-medium flex items-center space-x-2">
              <Users className="w-4 h-4" />
              <span>Users: {globalUsers.length}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-800/80 border border-amber-500/30 rounded-lg text-amber-400 font-medium flex items-center space-x-2">
              <Layers className="w-4 h-4" />
              <span>Staging: {unassignedData?.allFlat.length || 0}</span>
            </div>
            <div className="px-3 py-1.5 bg-slate-800/80 border border-rose-500/30 rounded-lg text-rose-400 font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4" />
              <span>Orphaned: {orphanedData?.allFlat.length || 0}</span>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Top Control Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-slate-900/90 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            {/* Import Button */}
            <label className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md shadow-amber-500/10 cursor-pointer transition">
              <Upload className="w-4 h-4" />
              <span>📥 Import JSON to Staging Buffer</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>

            {/* Targeted Export */}
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 font-semibold text-xs border border-purple-500/30 rounded-xl transition"
            >
              <Download className="w-4 h-4" />
              <span>📤 Targeted Export</span>
            </button>

            {/* Purge Orphaned */}
            <button
              onClick={() => setShowPurgeConfirm(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 font-semibold text-xs border border-rose-500/30 rounded-xl transition"
            >
              <Trash2 className="w-4 h-4" />
              <span>🧹 Purge Orphaned Data</span>
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Status Notification Message */}
        {statusMsg && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between ${
              statusMsg.type === 'success'
                ? 'bg-emerald-950/80 text-emerald-300 border-b border-emerald-500/30'
                : statusMsg.type === 'error'
                ? 'bg-rose-950/80 text-rose-300 border-b border-rose-500/30'
                : 'bg-amber-950/80 text-amber-300 border-b border-amber-500/30'
            }`}
          >
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="opacity-70 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* View Switcher Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-2 space-x-2 text-xs font-medium overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab('workspaces');
              setSelectedDocKeys(new Set());
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-xl border-t border-x transition shrink-0 ${
              activeTab === 'workspaces'
                ? 'bg-slate-900 border-emerald-500/50 text-emerald-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🟢 Workspaces ({godModeWorkspaces.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('users');
              setSelectedDocKeys(new Set());
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-xl border-t border-x transition shrink-0 ${
              activeTab === 'users'
                ? 'bg-slate-900 border-purple-500/50 text-purple-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>👥 Global Users ({globalUsers.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('staging');
              setSelectedDocKeys(new Set());
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-xl border-t border-x transition shrink-0 ${
              activeTab === 'staging'
                ? 'bg-slate-900 border-amber-500/50 text-amber-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🟡 📥 Staging Buffer ({unassignedData?.allFlat.length || 0})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('orphaned');
              setSelectedDocKeys(new Set());
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-xl border-t border-x transition shrink-0 ${
              activeTab === 'orphaned'
                ? 'bg-slate-900 border-rose-500/50 text-rose-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🔴 ⚠️ Orphaned Records ({orphanedData?.allFlat.length || 0})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('raw_browser');
              setSelectedDocKeys(new Set());
            }}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-t-xl border-t border-x transition shrink-0 ${
              activeTab === 'raw_browser'
                ? 'bg-slate-900 border-cyan-500/50 text-cyan-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📁 All Records (Raw Collection Browser)</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-900/60">
          {/* TAB 1: WORKSPACES VIEW */}
          {activeTab === 'workspaces' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {godModeWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  className="p-5 bg-slate-950/70 border border-slate-800 hover:border-emerald-500/40 rounded-2xl transition space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center space-x-2">
                          <span>{ws.name}</span>
                        </h3>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {ws.id}</p>
                      </div>
                      <span className="px-2 py-1 text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg shrink-0">
                        Active
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/60">
                      <p className="flex items-center space-x-1.5">
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                        <span>Owner: <strong className="text-slate-200">{ws.created_by || 'Unassigned'}</strong></span>
                      </p>
                      <p className="flex items-center space-x-1.5 text-slate-500">
                        <span>Email: {ws.member_emails?.[0] || 'N/A'}</span>
                      </p>
                      <p>Members Count: {ws.members?.length || ws.member_emails?.length || 1}</p>
                    </div>
                  </div>

                  {/* Direct Workspace Lifecycle Actions */}
                  <div className="space-y-2 pt-3 border-t border-slate-800/80">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setRenameWsTarget(ws);
                          setNewWsName(ws.name);
                          setShowRenameWsModal(true);
                        }}
                        className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>✏️ Rename</span>
                      </button>

                      <button
                        onClick={() => {
                          setChangeOwnerTarget(ws);
                          setSelectedNewOwnerUid(globalUsers[0]?.id || '');
                          setShowChangeOwnerModal(true);
                        }}
                        className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs font-semibold rounded-xl border border-purple-500/30 transition"
                      >
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                        <span>👑 Owner</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() =>
                          exportTargetedJson({
                            type: 'workspace',
                            workspaceId: ws.id
                          })
                        }
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition"
                      >
                        <Download className="w-3 h-3 text-emerald-400" />
                        <span>Export</span>
                      </button>

                      <button
                        onClick={() => {
                          setCascadeWipeTarget(ws);
                          setConfirmWsNameInput('');
                          setShowCascadeWipeWsModal(true);
                        }}
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-lg border border-rose-500/30 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>🗑️ Cascade Wipe</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: GLOBAL USERS VIEW */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              {/* Search Bar for Users */}
              <div className="flex items-center justify-between gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search global user profiles by name, email, or UID..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-purple-500/50 rounded-lg text-xs text-white placeholder-slate-500 outline-none"
                  />
                </div>
                <div className="text-xs text-slate-400 font-medium">
                  Showing <strong className="text-purple-300">{filteredUsers.length}</strong> of {globalUsers.length} user accounts
                </div>
              </div>

              {/* Users Table */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900/90 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">User Profile</th>
                        <th className="px-4 py-3">Email Address</th>
                        <th className="px-4 py-3">Default Workspace</th>
                        <th className="px-4 py-3">Super Admin Privilege</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500">
                            No user records found matching search.
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => {
                          const cleanEmail = (u.email || '').toLowerCase().trim();
                          const isMaster = cleanEmail === 'sibuma.syedameer@gmail.com';
                          const isSuper = isMaster || u.is_super_admin === true;

                          return (
                            <tr key={u.id} className="hover:bg-slate-900/50 transition">
                              <td className="px-4 py-3.5">
                                <div className="flex items-center space-x-2.5">
                                  <div className="p-2 bg-purple-950/60 border border-purple-500/30 text-purple-300 rounded-xl">
                                    <User className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <div className="font-bold text-white text-sm">
                                      {u.full_name || u.username || 'Unnamed User'}
                                    </div>
                                    <div className="font-mono text-[10px] text-slate-500">UID: {u.id}</div>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3.5 font-medium text-slate-200">
                                {u.email || 'N/A'}
                              </td>

                              <td className="px-4 py-3.5 font-mono text-slate-400">
                                {u.defaultWorkspaceId || u.workspace_id || (Array.isArray(u.workspaceIds) ? u.workspaceIds[0] : 'ws_default')}
                              </td>

                              <td className="px-4 py-3.5">
                                {isSuper ? (
                                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded-full">
                                    <Zap className="w-3 h-3 fill-current text-purple-400" />
                                    <span>Super Admin</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 px-2.5 py-1 text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700 rounded-full">
                                    <span>Standard Member</span>
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-right space-x-2">
                                <button
                                  onClick={() => handleToggleSuperAdmin(u.id, !!u.is_super_admin, u.email)}
                                  disabled={isMaster}
                                  className={`px-3 py-1.5 font-bold text-xs rounded-xl border transition ${
                                    isSuper
                                      ? 'bg-amber-950/50 hover:bg-amber-900 text-amber-300 border-amber-500/30'
                                      : 'bg-purple-950/50 hover:bg-purple-900 text-purple-300 border-purple-500/30'
                                  } ${isMaster ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={isMaster ? 'Master Account permanently retains Super Admin privileges' : 'Toggle Super Admin Privilege'}
                                >
                                  ⚡ {isSuper ? 'Demote Admin' : 'Grant Super Admin'}
                                </button>

                                <button
                                  onClick={() => {
                                    setDeleteUserTarget({ id: u.id, email: u.email, full_name: u.full_name || u.username });
                                    setShowDeleteUserModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-500/30 transition"
                                  title="Delete User Profile & Scrub Records"
                                >
                                  🗑️ Delete & Scrub
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3, 4, 5: RECORD LIST VIEWS */}
          {activeTab !== 'workspaces' && activeTab !== 'users' && (
            <div className="space-y-4">
              {/* Filter Controls Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <div className="flex items-center space-x-3 flex-1 min-w-[240px]">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search JSON records..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 focus:border-purple-500/50 rounded-lg text-xs text-white placeholder-slate-500 outline-none"
                    />
                  </div>

                  {activeTab !== 'raw_browser' && (
                    <select
                      value={collectionFilter}
                      onChange={(e) => setCollectionFilter(e.target.value)}
                      className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg outline-none"
                    >
                      <option value="all">All Domain Collections</option>
                      {TARGET_COLLECTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  )}

                  {activeTab === 'raw_browser' && (
                    <select
                      value={selectedRawCollection}
                      onChange={(e) => setSelectedRawCollection(e.target.value as TargetCollectionName)}
                      className="px-3 py-1.5 bg-slate-900 border border-cyan-500/40 text-xs text-cyan-300 font-semibold rounded-lg outline-none"
                    >
                      {ALL_BROWSER_COLLECTIONS.map((c) => (
                        <option key={c} value={c}>
                          Collection: {c}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Bulk Actions Bar */}
                {selectedDocKeys.size > 0 && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-amber-300 font-medium">
                      {selectedDocKeys.size} Selected
                    </span>

                    <button
                      onClick={() => {
                        const targetList: Array<{ _collection: string; id: string }> = [];
                        getFilteredDocsForCurrentTab.forEach((d) => {
                          const key = `${d._collection || selectedRawCollection}_${d.id}`;
                          if (selectedDocKeys.has(key)) {
                            targetList.push({ _collection: d._collection || selectedRawCollection, id: d.id });
                          }
                        });
                        setReassignTargetDocs(targetList);
                        setShowReassignModal(true);
                      }}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      <FolderInput className="w-3.5 h-3.5" />
                      <span>Reassign / Move</span>
                    </button>

                    <button
                      onClick={async () => {
                        if (!window.confirm(`Hard delete ${selectedDocKeys.size} selected document(s)?`)) return;
                        const targetList: Array<{ _collection: string; id: string }> = [];
                        getFilteredDocsForCurrentTab.forEach((d) => {
                          const key = `${d._collection || selectedRawCollection}_${d.id}`;
                          if (selectedDocKeys.has(key)) {
                            targetList.push({ _collection: d._collection || selectedRawCollection, id: d.id });
                          }
                        });
                        await bulkDeleteDocs(targetList);
                        setSelectedDocKeys(new Set());
                        await loadData();
                      }}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Bulk Delete</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Record Cards Grid / Table */}
              <div className="space-y-2">
                {getFilteredDocsForCurrentTab.length === 0 ? (
                  <div className="p-12 text-center bg-slate-950/40 border border-slate-800 rounded-2xl text-slate-500 text-xs">
                    No matching documents found in collection '{selectedRawCollection}'.
                  </div>
                ) : (
                  getFilteredDocsForCurrentTab.map((docItem) => {
                    const colName = docItem._collection || selectedRawCollection;
                    const docKey = `${colName}_${docItem.id}`;
                    const isSelected = selectedDocKeys.has(docKey);

                    return (
                      <div
                        key={docKey}
                        className={`p-4 bg-slate-950/70 border rounded-xl transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          isSelected ? 'border-amber-500/70 bg-amber-500/5' : 'border-slate-800/80 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start space-x-3 flex-1 overflow-hidden">
                          <button
                            onClick={() => toggleDocSelection(docKey)}
                            className="mt-0.5 text-slate-400 hover:text-amber-400 transition"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-amber-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>

                          <div className="space-y-1 overflow-hidden flex-1">
                            <div className="flex items-center space-x-2">
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-800 text-slate-300 rounded uppercase tracking-wider">
                                {colName}
                              </span>
                              <span className="text-xs font-mono font-bold text-white">{docItem.id}</span>
                              {docItem.workspace_id !== undefined && (
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                                    docItem.workspace_id === 'unassigned'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : !docItem.workspace_id
                                      ? 'bg-rose-500/20 text-rose-300'
                                      : 'bg-emerald-500/20 text-emerald-300'
                                  }`}
                                >
                                  ws: {docItem.workspace_id || 'MISSING'}
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-300 font-medium truncate">
                              {docItem.display_name ||
                                docItem.canonical_name ||
                                docItem.full_name ||
                                docItem.quote_ref_no ||
                                docItem.subject ||
                                docItem.name ||
                                docItem.email ||
                                JSON.stringify(docItem).slice(0, 120)}
                            </p>
                          </div>
                        </div>

                        {/* Individual Item Actions */}
                        <div className="flex items-center space-x-2 border-t md:border-t-0 pt-2 md:pt-0 border-slate-800">
                          <button
                            onClick={() => {
                              setReassignTargetDocs([{ _collection: colName, id: docItem.id }]);
                              setShowReassignModal(true);
                            }}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-purple-300 text-xs rounded-lg transition flex items-center space-x-1"
                            title="Reassign / Move Workspace"
                          >
                            <FolderInput className="w-3.5 h-3.5" />
                            <span>Reassign</span>
                          </button>

                          <button
                            onClick={() => handleDuplicate(colName, docItem.id)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition flex items-center space-x-1"
                            title="Duplicate Record"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Duplicate</span>
                          </button>

                          <button
                            onClick={() => handleDeleteSingle(colName, docItem.id)}
                            className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs rounded-lg transition flex items-center space-x-1"
                            title="Hard Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: RENAME WORKSPACE MODAL */}
      {showRenameWsModal && renameWsTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-emerald-500/40 rounded-2xl p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-emerald-300 flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-emerald-400" />
                <span>Rename Workspace</span>
              </h3>
              <button onClick={() => setShowRenameWsModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Workspace ID</label>
                <div className="font-mono text-slate-300 bg-slate-800 p-2 rounded-xl">{renameWsTarget.id}</div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">New Workspace Name</label>
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder="Enter new workspace name..."
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowRenameWsModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteRenameWorkspace}
                disabled={!newWsName.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
              >
                Save New Name
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CHANGE WORKSPACE OWNER MODAL */}
      {showChangeOwnerModal && changeOwnerTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-purple-500/40 rounded-2xl p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-purple-300 flex items-center space-x-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <span>Re-assign Workspace Owner</span>
              </h3>
              <button onClick={() => setShowChangeOwnerModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Workspace: <span className="font-bold text-white">{changeOwnerTarget.name}</span>
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Select New Owner Account</label>
                <select
                  value={selectedNewOwnerUid}
                  onChange={(e) => setSelectedNewOwnerUid(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:border-purple-500"
                >
                  <option value="">-- Select Registered User --</option>
                  {globalUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.username || 'User'} ({u.email || u.id})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowChangeOwnerModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteChangeOwner}
                disabled={!selectedNewOwnerUid}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition"
              >
                Re-assign Owner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: CASCADE WIPE WORKSPACE MODAL */}
      {showCascadeWipeWsModal && cascadeWipeTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/60 rounded-2xl p-6 space-y-4 text-slate-100">
            <div className="flex items-center space-x-3 text-rose-400 border-b border-slate-800 pb-3">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
              <h3 className="text-base font-bold text-rose-300">Hard Delete & Cascade Wipe Workspace</h3>
            </div>

            <p className="text-xs text-rose-200/90 leading-relaxed bg-rose-950/40 p-3 rounded-xl border border-rose-500/30">
              ⚠️ <strong>WARNING:</strong> This will permanently delete workspace document <strong>'{cascadeWipeTarget.name}'</strong> AND all associated records across <strong>companies, contacts, enquiries, call logs, products, salespersons, dropdown configs, and workspace members</strong>.
            </p>

            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-semibold">
                To confirm, type workspace name: <span className="font-mono text-rose-300 font-bold">{cascadeWipeTarget.name}</span>
              </label>
              <input
                type="text"
                value={confirmWsNameInput}
                onChange={(e) => setConfirmWsNameInput(e.target.value)}
                placeholder="Type workspace name exactly to confirm..."
                className="w-full px-3 py-2 bg-slate-800 border border-rose-500/50 rounded-xl text-white outline-none focus:border-rose-400 font-mono"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowCascadeWipeWsModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteCascadeWipe}
                disabled={confirmWsNameInput.trim() !== cascadeWipeTarget.name.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition"
              >
                Confirm Hard Delete & Cascade Wipe
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE USER & SCRUB MODAL */}
      {showDeleteUserModal && deleteUserTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/60 rounded-2xl p-6 space-y-4 text-slate-100">
            <div className="flex items-center space-x-3 text-rose-400 border-b border-slate-800 pb-3">
              <UserX className="w-6 h-6 text-rose-500" />
              <h3 className="text-base font-bold text-rose-300">Delete User Profile & Scrub Records</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete the user account for <strong className="text-white">{deleteUserTarget.full_name || deleteUserTarget.email || deleteUserTarget.id}</strong>?
            </p>

            <p className="text-xs text-rose-300/80 bg-rose-950/30 p-2.5 rounded-xl border border-rose-500/20">
              This will permanently delete the <code className="font-mono">users/{deleteUserTarget.id}</code> document and scrub all matching entries in <code className="font-mono">workspace_members</code> and <code className="font-mono">salespersons</code> collections.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowDeleteUserModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition"
              >
                Confirm Delete & Scrub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: TARGETED EXPORT MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-purple-500/40 rounded-2xl p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-amber-300 flex items-center space-x-2">
                <Download className="w-5 h-5 text-amber-400" />
                <span>Targeted Export JSON</span>
              </h3>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Export Scope</label>
                <select
                  value={exportScope}
                  onChange={(e) => setExportScope(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                >
                  <option value="workspace">Active Workspace</option>
                  <option value="unassigned">Staging Buffer (Unassigned)</option>
                  <option value="orphaned">Orphaned Records</option>
                </select>
              </div>

              {exportScope === 'workspace' && (
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Select Workspace</label>
                  <select
                    value={exportWsId}
                    onChange={(e) => setExportWsId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                  >
                    {godModeWorkspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name} ({ws.id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Target Collection</label>
                <select
                  value={exportColName}
                  onChange={(e) => setExportColName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                >
                  <option value="all">All Domain Collections</option>
                  {ALL_BROWSER_COLLECTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await exportTargetedJson({
                    type: exportScope,
                    workspaceId: exportScope === 'workspace' ? exportWsId : undefined,
                    collectionName: exportColName !== 'all' ? exportColName : undefined
                  });
                  setShowExportModal(false);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition"
              >
                Download Export JSON
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: REASSIGN / MOVE WORKSPACE MODAL */}
      {showReassignModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-purple-500/40 rounded-2xl p-6 space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-purple-300 flex items-center space-x-2">
                <FolderInput className="w-5 h-5 text-purple-400" />
                <span>Reassign / Move Workspace</span>
              </h3>
              <button onClick={() => setShowReassignModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Reassigning <span className="font-bold text-amber-300">{reassignTargetDocs.length}</span> record(s).
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Target Workspace</label>
                <select
                  value={targetWsId}
                  onChange={(e) => setTargetWsId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                >
                  <option value="unassigned">🟡 Staging Buffer (Unassigned)</option>
                  {godModeWorkspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      🟢 {ws.name} ({ws.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Reassignment Mode</label>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setReassignMode('shallow')}
                    className={`p-3 text-left rounded-xl border transition ${
                      reassignMode === 'shallow'
                        ? 'bg-purple-950/60 border-purple-500 text-purple-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">Shallow</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Reassign only the selected document(s)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setReassignMode('cascade')}
                    className={`p-3 text-left rounded-xl border transition ${
                      reassignMode === 'cascade'
                        ? 'bg-purple-950/60 border-purple-500 text-purple-200'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">Cascade</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Reassign doc + all linked contacts, enquiries, call logs
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowReassignModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteReassign}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl transition"
              >
                Execute Reassignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: PURGE ORPHANED CONFIRMATION MODAL */}
      {showPurgeConfirm && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl p-6 space-y-4 text-slate-100">
            <div className="flex items-center space-x-3 text-rose-400 border-b border-slate-800 pb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-rose-300">Purge All Orphaned Data?</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              This will permanently delete all <span className="font-bold text-rose-400">{orphanedData?.allFlat.length || 0}</span> document(s) across all collections that do not match an active workspace or are missing a valid workspace ID.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowPurgeConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleExecutePurge}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition"
              >
                Confirm Hard Purge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
