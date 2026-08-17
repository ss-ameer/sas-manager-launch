import React, { useState } from 'react';
import { Workspace, UserProfile, UserRole, WorkspaceMember } from '../types';
import { X, Plus, Check, Building, Layers, Globe, Shield, Edit3, Trash2, Key, Download, AlertTriangle } from 'lucide-react';
import { safeAddDoc, safeUpdateDoc, safeGetDocs, safeGetDoc, safeDeleteDoc, safeSetDoc, db } from '../firebase';
import { where, writeBatch, doc } from 'firebase/firestore';
import { exportWorkspaceData, importWorkspaceData } from '../services/SyncEngine';

function downloadJsonFile(filename: string, data: any) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface WorkspaceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onWorkspacesChange?: (workspaces: Workspace[]) => void;
  currentUser: any;
  onProfileUpdated?: (updated: any) => void;
  triggerToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DEFAULT_GEOGRAPHIES = [
  'Dubai, UAE',
  'Abu Dhabi, UAE',
  'Northern Emirates, UAE',
  'Saudi Arabia (KSA)',
  'Qatar',
  'Oman',
  'Kuwait',
  'Bahrain',
  'International / Other'
];

export default function WorkspaceManagerModal({
  isOpen,
  onClose,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onWorkspacesChange,
  currentUser,
  onProfileUpdated,
  triggerToast
}: WorkspaceManagerModalProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);

  // Join Code State
  const [joinCode, setJoinCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enquiriesEnabled, setEnquiriesEnabled] = useState(true);
  const [callLogEnabled, setCallLogEnabled] = useState(true);
  const [geographyText, setGeographyText] = useState(DEFAULT_GEOGRAPHIES.join('\n'));
  const [saving, setSaving] = useState(false);
  const [deletingWs, setDeletingWs] = useState<Workspace | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteCounts, setDeleteCounts] = useState<{
    companies: number;
    contacts: number;
    enquiries: number;
    call_logs: number;
    products: number;
    salespersons: number;
  } | null>(null);
  const [compiledBackupData, setCompiledBackupData] = useState<any | null>(null);
  const [showSecondaryPurgeCheck, setShowSecondaryPurgeCheck] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // Workspace Backup Import State
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmWipeCheck, setConfirmWipeCheck] = useState(false);
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const workspaceFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportWorkspaceJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImportFile(file);
    setIsImportingJson(true);
    if (e.target) e.target.value = '';
  };

  const handleExecuteImport = async () => {
    if (!selectedImportFile) return;
    setIsRestoring(true);
    try {
      const fileText = await selectedImportFile.text();
      const parsed = JSON.parse(fileText);
      const targetWsId = activeWorkspaceId || 'ws_default';

      await importWorkspaceData(
        targetWsId,
        parsed,
        importMode,
        (msg) => triggerToast(msg, 'info')
      );

      triggerToast('Workspace restored successfully!', 'success');
      setIsImportingJson(false);
      setSelectedImportFile(null);
      setConfirmWipeCheck(false);
      setImportMode('merge');
    } catch (err: any) {
      triggerToast(`Import failed: ${err.message}`, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const fetchWorkspaceDataAndCounts = async (targetWs: Workspace) => {
    setDeleteLoading(true);
    try {
      const wsId = targetWs.id;
      const collections = ['companies', 'contacts', 'enquiries', 'call_logs', 'products', 'salespersons'];
      const recordsMap: Record<string, any[]> = {};
      const counts: Record<string, number> = {
        companies: 0,
        contacts: 0,
        enquiries: 0,
        call_logs: 0,
        products: 0,
        salespersons: 0
      };

      for (const col of collections) {
        const docMap = new Map<string, any>();
        const snap1 = await safeGetDocs(col, where('workspace_id', '==', wsId));
        const snap2 = await safeGetDocs(col, where('workspaceId', '==', wsId));

        if (snap1 && !snap1.empty) {
          for (const docSnap of snap1.docs) {
            docMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
          }
        }
        if (snap2 && !snap2.empty) {
          for (const docSnap of snap2.docs) {
            if (!docMap.has(docSnap.id)) {
              docMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            }
          }
        }

        const items = Array.from(docMap.values());
        recordsMap[col] = items;
        counts[col] = items.length;
      }

      const backupPayload = {
        workspace_id: targetWs.id,
        workspace_name: targetWs.name,
        exported_at: new Date().toISOString(),
        workspace_metadata: targetWs,
        data: recordsMap
      };

      setDeleteCounts(counts as any);
      setCompiledBackupData(backupPayload);
    } catch (err) {
      console.error('Error fetching workspace breakdown:', err);
      setDeleteCounts({
        companies: 0,
        contacts: 0,
        enquiries: 0,
        call_logs: 0,
        products: 0,
        salespersons: 0
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const toggleDeleteWorkspace = (ws: Workspace) => {
    if (deletingWs?.id === ws.id) {
      setDeletingWs(null);
      setDeleteCounts(null);
      setCompiledBackupData(null);
      setShowSecondaryPurgeCheck(false);
    } else {
      setDeletingWs(ws);
      setShowSecondaryPurgeCheck(false);
      fetchWorkspaceDataAndCounts(ws);
    }
  };

  const handleDeleteWorkspace = async (wsId: string) => {
    if (workspaces.length <= 1) {
      triggerToast('Cannot delete the last remaining workspace.', 'error');
      return;
    }
    setIsPurging(true);
    try {
      const collections = ['companies', 'contacts', 'enquiries', 'call_logs', 'products', 'salespersons'];

      let batch = writeBatch(db);
      let count = 0;

      for (const col of collections) {
        const deletedDocIds = new Set<string>();
        const snap1 = await safeGetDocs(col, where('workspace_id', '==', wsId));
        const snap2 = await safeGetDocs(col, where('workspaceId', '==', wsId));

        const docsToDelete = [];
        if (snap1 && !snap1.empty) {
          for (const docSnap of snap1.docs) {
            if (!deletedDocIds.has(docSnap.id)) {
              deletedDocIds.add(docSnap.id);
              docsToDelete.push(docSnap);
            }
          }
        }
        if (snap2 && !snap2.empty) {
          for (const docSnap of snap2.docs) {
            if (!deletedDocIds.has(docSnap.id)) {
              deletedDocIds.add(docSnap.id);
              docsToDelete.push(docSnap);
            }
          }
        }

        for (const docSnap of docsToDelete) {
          batch.delete(docSnap.ref);
          count++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
      }

      // Add the target workspaces document itself to the batch
      const targetWsRef = doc(db, 'workspaces', wsId);
      batch.delete(targetWsRef);
      count++;

      if (count > 0) {
        await batch.commit();
      }

      // Fallback safe delete call
      await safeDeleteDoc('workspaces', wsId);

      // User Session Safety Protection
      if (activeWorkspaceId === wsId) {
        onSelectWorkspace('ws_default');
        localStorage.setItem('last_active_workspace_id', 'ws_default');
      }

      const nextWorkspaces = workspaces.filter((w) => w.id !== wsId);
      if (onWorkspacesChange) {
        onWorkspacesChange(nextWorkspaces);
      }
      triggerToast('Workspace removed successfully.', 'success');
      setDeletingWs(null);
      setDeleteCounts(null);
      setCompiledBackupData(null);
      setShowSecondaryPurgeCheck(false);
    } catch (err: any) {
      triggerToast('Failed to delete workspace: ' + err.message, 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const handleDownloadBackupAndPurge = async () => {
    if (!deletingWs) return;
    const dateStr = new Date().toISOString().split('T')[0];
    const sanitizedName = (deletingWs.name || 'workspace').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const fileName = `workspace_backup_${sanitizedName}_${dateStr}.json`;

    const payload = compiledBackupData || {
      workspace_id: deletingWs.id,
      workspace_name: deletingWs.name,
      exported_at: new Date().toISOString(),
      workspace_metadata: deletingWs,
      data: {}
    };

    downloadJsonFile(fileName, payload);
    triggerToast(`Backup downloaded as ${fileName}. Purging workspace...`, 'info');
    await handleDeleteWorkspace(deletingWs.id);
  };

  const confirmPurgeWithoutBackup = async () => {
    if (!deletingWs) return;
    await handleDeleteWorkspace(deletingWs.id);
  };

  if (!isOpen) return null;

  const startCreate = () => {
    setName('');
    setDescription('');
    setEnquiriesEnabled(true);
    setCallLogEnabled(true);
    setGeographyText(DEFAULT_GEOGRAPHIES.join('\n'));
    setEditingWorkspace(null);
    setIsJoining(false);
    setIsCreating(true);
  };

  const handleRedeemJoinCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawCode = joinCode.trim().toUpperCase();
    if (!rawCode) return;
    setRedeeming(true);

    const possibleCodes = Array.from(new Set([
      rawCode,
      rawCode.startsWith('OMNI-INV-') ? rawCode : `OMNI-INV-${rawCode}`,
      rawCode.replace(/^OMNI-INV-/, '')
    ]));

    try {
      let inviteDoc: any = null;
      let inviteData: any = null;

      // 1. Try querying Firestore for any of the possible code variations
      for (const codeVariant of possibleCodes) {
        if (inviteData) break;
        const snap = await safeGetDocs('invites', where('code', '==', codeVariant));
        if (snap && !snap.empty) {
          const found = snap.docs.find((d) => {
            const data = d.data();
            return data.used === false || data.used === 'false' || !data.used;
          });
          if (found) {
            inviteDoc = found;
            inviteData = found.data();
            break;
          }
        }
      }

      // 2. Fallback: Query all invites or check local cache if filtered query returned no results
      if (!inviteData) {
        const allSnap = await safeGetDocs('invites');
        if (allSnap && !allSnap.empty) {
          const found = allSnap.docs.find((d) => {
            const data = d.data();
            const invCode = (data.code || '').toUpperCase();
            const isUnused = data.used === false || data.used === 'false' || !data.used;
            return isUnused && possibleCodes.includes(invCode);
          });
          if (found) {
            inviteDoc = found;
            inviteData = found.data();
          }
        }
      }

      // 3. Local storage fallback
      if (!inviteData) {
        try {
          const rawLocal = localStorage.getItem('omni_invites');
          if (rawLocal) {
            const localInvites: any[] = JSON.parse(rawLocal);
            const foundLocal = localInvites.find((i) => {
              const c = (i.code || '').toUpperCase();
              const isUnused = !i.used || i.used === false || i.used === 'false';
              return isUnused && possibleCodes.includes(c);
            });
            if (foundLocal) {
              inviteDoc = { id: foundLocal.id };
              inviteData = foundLocal;
            }
          }
        } catch (e) {
          console.warn("Local invites fallback check error:", e);
        }
      }

      if (!inviteData || !inviteDoc) {
        triggerToast('Invalid or expired invite code. Please check with your Administrator.', 'error');
        setRedeeming(false);
        return;
      }

      const wsId = inviteData.workspaceId || 'ws_default';
      const wsName = inviteData.workspaceName || 'Target Workspace';
      const assignedRole = inviteData.role || 'Member';
      const nowIso = new Date().toISOString();

      // 1. Prepare Invite Code Update Payload
      const updatedUsedByList = Array.isArray(inviteData.usedByList) ? [...inviteData.usedByList] : [];
      updatedUsedByList.push({
        uid: currentUser?.uid || 'unknown',
        email: currentUser?.email || 'User',
        name: currentUser?.full_name || currentUser?.username || 'Team Member',
        at: nowIso
      });

      const inviteUpdatePayload = {
        is_used: true,
        used: true,
        claimed_by_uid: currentUser?.uid || 'unknown',
        claimed_by_email: currentUser?.email || 'User',
        claimed_at: nowIso,
        usedBy: currentUser?.email || currentUser?.uid || 'User',
        usedAt: nowIso,
        usedByList: updatedUsedByList
      };

      // 2. Prepare User Profile Update Payload
      const currentWsIds = Array.isArray(currentUser?.workspaceIds) && currentUser.workspaceIds.length > 0
        ? currentUser.workspaceIds
        : ['ws_default'];
      const updatedWsIds = Array.from(new Set([...currentWsIds, wsId]));

      const currentWorkspaceRoles = currentUser?.workspace_roles || {};
      const updatedWorkspaceRoles: Record<string, UserRole> = {
        ...currentWorkspaceRoles,
        [wsId]: assignedRole
      };

      // Keep user's primary defaultWorkspaceId if set, otherwise set to wsId
      const targetDefaultWorkspaceId = currentUser?.defaultWorkspaceId || wsId;

      const userUpdatePayload = {
        ...currentUser,
        workspaceIds: updatedWsIds,
        defaultWorkspaceId: targetDefaultWorkspaceId,
        workspace_roles: updatedWorkspaceRoles,
        ...(currentUser?.role ? { role: currentUser.role } : {})
      };

      const updatedUserProfile: UserProfile = {
        ...currentUser,
        workspaceIds: updatedWsIds,
        defaultWorkspaceId: targetDefaultWorkspaceId,
        workspace_roles: updatedWorkspaceRoles,
        ...(currentUser?.role ? { role: currentUser.role } : {})
      };

      // 3. Prepare Workspace Members Update Payload
      const existingWs = workspaces.find((w) => w.id === wsId);
      let targetWsDoc: Workspace | null = existingWs || null;

      if (!targetWsDoc) {
        const wsSnap = await safeGetDoc('workspaces', wsId);
        if (wsSnap && wsSnap.exists()) {
          targetWsDoc = { id: wsSnap.id, ...wsSnap.data() } as Workspace;
        }
      }

      const existingMembers = Array.isArray(targetWsDoc?.members) ? targetWsDoc.members : [];
      const memberUid = currentUser?.uid || 'unknown';
      const memberEmail = currentUser?.email || '';
      const memberName = currentUser?.full_name || currentUser?.username || (currentUser?.email ? currentUser.email.split('@')[0] : '') || 'Team Member';

      const newMemberObj: WorkspaceMember = {
        uid: memberUid,
        email: memberEmail,
        name: memberName,
        full_name: memberName,
        role: assignedRole,
        joined_at: nowIso
      };

      const hasMember = existingMembers.some(
        (m: any) => m.uid === memberUid || (m.email && m.email.toLowerCase() === memberEmail.toLowerCase())
      );

      const updatedMembers = hasMember
        ? existingMembers.map((m: any) =>
            m.uid === memberUid || (m.email && m.email.toLowerCase() === memberEmail.toLowerCase())
              ? { ...m, role: assignedRole, joined_at: m.joined_at || nowIso }
              : m
          )
        : [...existingMembers, newMemberObj];

      const workspaceUpdatePayload: Workspace = {
        name: wsName,
        created_by: 'system',
        createdAt: nowIso,
        modules: { enquiriesEnabled: true, callLogEnabled: true },
        ...(targetWsDoc || {}),
        id: wsId,
        members: updatedMembers
      };

      // Sequential Safe Writes Execution Sequence:
      // Step 1: Update User B document FIRST so user permissions and workspace membership are guaranteed
      if (currentUser?.uid && !currentUser.uid.startsWith('local_')) {
        try {
          await safeSetDoc('users', currentUser.uid, userUpdatePayload, { merge: true });
        } catch (uErr) {
          console.warn("Safe write to users collection warning:", uErr);
        }
      }

      // Step 2: Update Invite document NEXT (minimal permission-safe payload)
      if (inviteDoc && inviteDoc.id) {
        try {
          await safeUpdateDoc('invites', inviteDoc.id, inviteUpdatePayload);
        } catch (iErr) {
          console.warn("Safe write to invites collection warning:", iErr);
        }
      }

      // Step 3: Update Workspace document THIRD (add User B to members array)
      if (wsId) {
        try {
          await safeSetDoc('workspaces', wsId, workspaceUpdatePayload, { merge: true });

          // Also create workspace_members doc for currentUser
          if (currentUser?.uid) {
            const wmDocId = `wm_${wsId}_${currentUser.uid}`;
            const wmDoc = {
              id: wmDocId,
              workspace_id: wsId,
              workspaceId: wsId,
              user_id: currentUser.uid,
              uid: currentUser.uid,
              email: currentUser.email || '',
              name: currentUser.full_name || currentUser.username || currentUser.email,
              role: assignedRole,
              status: 'active',
              created_at: nowIso
            };
            await safeSetDoc('workspace_members', wmDocId, wmDoc);
          }
        } catch (wErr) {
          console.warn("Safe write to workspaces collection warning:", wErr);
        }
      }

      // Step 4: Force a direct, fresh Firestore fetch for workspaces/{targetWorkspaceId}
      // This pulls Admin A's full workspace metadata (name, settings, categories, geography_options, modules, etc.) directly into User B's local state
      let freshWsData: Workspace | null = null;
      try {
        const freshWsSnap = await safeGetDoc('workspaces', wsId);
        if (freshWsSnap && freshWsSnap.exists()) {
          freshWsData = { id: freshWsSnap.id, ...freshWsSnap.data() } as Workspace;
        }
      } catch (fErr) {
        console.warn("Could not fetch fresh workspace metadata:", fErr);
      }

      // Update Local Caches (IndexedDB / LocalStorage)
      localStorage.setItem('omni_local_user', JSON.stringify(updatedUserProfile));
      if (currentUser?.uid) {
        localStorage.setItem(`omni_user_${currentUser.uid}`, JSON.stringify(updatedUserProfile));
      }

      const updatedWsObject: Workspace = {
        ...(freshWsData || targetWsDoc || {
          id: wsId,
          name: wsName,
          created_by: 'system',
          createdAt: nowIso,
          modules: { enquiriesEnabled: true, callLogEnabled: true }
        }),
        members: updatedMembers
      };

      const currentAllWorkspaces = Array.isArray(workspaces) ? workspaces : [];
      const updatedAllWorkspaces = currentAllWorkspaces.some((w) => w.id === wsId)
        ? currentAllWorkspaces.map((w) => (w.id === wsId ? updatedWsObject : w))
        : [...currentAllWorkspaces, updatedWsObject];

      try {
        localStorage.setItem('omni_workspaces', JSON.stringify(updatedAllWorkspaces));
      } catch (e) {}

      // Notify parent component state (User profile + Workspaces list)
      if (onProfileUpdated) {
        onProfileUpdated(updatedUserProfile);
      }

      if (onWorkspacesChange) {
        onWorkspacesChange(updatedAllWorkspaces);
      }

      // Immediately select and switch active workspace context
      onSelectWorkspace(wsId);
      triggerToast(`Successfully joined workspace: ${wsName}!`, 'success');
      setIsJoining(false);
      setJoinCode('');
    } catch (err: any) {
      console.error(err);
      triggerToast('Failed to redeem invite code: ' + err.message, 'error');
    } finally {
      setRedeeming(false);
    }
  };

  const startEdit = (ws: Workspace) => {
    setName(ws.name);
    setDescription(ws.description || '');
    setEnquiriesEnabled(ws.modules?.enquiriesEnabled !== false);
    setCallLogEnabled(ws.modules?.callLogEnabled !== false);
    setGeographyText((ws.geography_options || DEFAULT_GEOGRAPHIES).join('\n'));
    setEditingWorkspace(ws);
    setIsCreating(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      triggerToast('Workspace name is required', 'error');
      return;
    }

    setSaving(true);
    try {
      const geoList = geographyText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const workspaceData = {
        name: name.trim(),
        description: description.trim(),
        modules: {
          enquiriesEnabled,
          callLogEnabled
        },
        geography_options: geoList.length > 0 ? geoList : DEFAULT_GEOGRAPHIES,
        created_by: currentUser?.username || 'Admin',
        updatedAt: new Date().toISOString()
      };

      if (editingWorkspace) {
        const updatedWsList = workspaces.map((w) =>
          w.id === editingWorkspace.id ? { ...w, ...workspaceData } : w
        );
        if (onWorkspacesChange) onWorkspacesChange(updatedWsList);
        await safeUpdateDoc('workspaces', editingWorkspace.id, workspaceData);
        triggerToast(`Workspace '${name}' updated successfully!`, 'success');
      } else {
        const tempId = 'ws_' + Date.now();
        const createdIso = new Date().toISOString();
        const creatorMember: WorkspaceMember = {
          uid: currentUser?.uid || 'unknown',
          email: currentUser?.email || '',
          name: currentUser?.full_name || currentUser?.username || 'Admin',
          full_name: currentUser?.full_name || currentUser?.username || 'Admin',
          role: 'Admin',
          joined_at: createdIso
        };

        const workspaceWithMembers = {
          ...workspaceData,
          members: [creatorMember],
          createdAt: createdIso
        };

        const tempWs: Workspace = {
          id: tempId,
          ...workspaceWithMembers
        };

        const newDoc = await safeAddDoc('workspaces', workspaceWithMembers);

        const finalId = newDoc?.id || tempId;
        tempWs.id = finalId;

        if (currentUser?.uid && !currentUser.uid.startsWith('local_')) {
          const currentRoles = currentUser.workspace_roles || {};
          const updatedWorkspaceRoles = {
            ...currentRoles,
            [finalId]: 'Admin' as UserRole
          };
          const updatedWsIds = Array.from(new Set([...(currentUser.workspaceIds || []), finalId]));

          const updatedUserProfile: UserProfile = {
            ...currentUser,
            workspaceIds: updatedWsIds,
            defaultWorkspaceId: currentUser?.defaultWorkspaceId || finalId,
            workspace_roles: updatedWorkspaceRoles,
            ...(currentUser?.role ? { role: currentUser.role } : {})
          };

          await safeSetDoc('users', currentUser.uid, updatedUserProfile, { merge: true });

          if (onProfileUpdated) {
            onProfileUpdated(updatedUserProfile);
          }
        }

        if (onWorkspacesChange) {
          const exists = workspaces.some((w) => w.id === finalId);
          if (!exists) {
            onWorkspacesChange([...workspaces, tempWs]);
          }
        }

        onSelectWorkspace(finalId);
        triggerToast(`Workspace '${name}' created!`, 'success');
      }

      setIsCreating(false);
      setEditingWorkspace(null);
    } catch (err: any) {
      console.error('Error saving workspace:', err);
      triggerToast('Failed to save workspace', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-md">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Workspace Architecture</h2>
              <p className="text-xs text-slate-300">Switch context or configure business modules</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {isJoining ? (
            <form onSubmit={handleRedeemJoinCode} className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-600" />
                  <span>Join Workspace via Invite Code</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsJoining(false)}
                  className="text-xs text-slate-500 hover:text-slate-900 font-semibold"
                >
                  Cancel & Back
                </button>
              </div>

              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-slate-700 space-y-1">
                <p className="font-bold text-slate-900">Enter your Administrator's Invite Code</p>
                <p className="text-slate-600">Redeeming an invite code adds that workspace context directly to your account profile so you can switch into it.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Invite Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="OMNI-INV-XXXXXX"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-center uppercase font-bold text-sm tracking-wider"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsJoining(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={redeeming}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center space-x-2"
                >
                  <Key className="w-4 h-4" />
                  <span>{redeeming ? 'Validating...' : 'Join Workspace'}</span>
                </button>
              </div>
            </form>
          ) : isImportingJson ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-600 rotate-180" />
                    <span>Import Workspace JSON Backup</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Upload a JSON workspace backup to restore companies, contacts, enquiries, activity logs, and products.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportingJson(false);
                    setSelectedImportFile(null);
                    setConfirmWipeCheck(false);
                    setImportMode('merge');
                  }}
                  className="text-xs text-slate-500 hover:text-slate-900 font-semibold"
                >
                  Cancel & Back
                </button>
              </div>

              {/* Target Workspace Banner */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                    {(workspaces.find(w => w.id === activeWorkspaceId)?.name || 'WS').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Target Workspace: {workspaces.find(w => w.id === activeWorkspaceId)?.name || 'Active Workspace'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      ID: {activeWorkspaceId || 'ws_default'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                  Active Workspace
                </span>
              </div>

              {/* File Selection Box */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  1. Select Backup File (.json) *
                </label>
                <input
                  type="file"
                  ref={workspaceFileInputRef}
                  onChange={handleImportWorkspaceJson}
                  accept=".json"
                  className="hidden"
                />
                <div
                  onClick={() => workspaceFileInputRef.current?.click()}
                  className={`p-4 rounded-xl border-2 border-dashed transition cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center ${
                    selectedImportFile
                      ? 'bg-emerald-50/50 border-emerald-300 text-emerald-900'
                      : 'bg-slate-50 border-slate-300 hover:border-blue-400 hover:bg-blue-50/30 text-slate-600'
                  }`}
                >
                  <Download className={`w-6 h-6 ${selectedImportFile ? 'text-emerald-600 rotate-180' : 'text-slate-400'}`} />
                  {selectedImportFile ? (
                    <div>
                      <p className="text-xs font-bold text-slate-900 font-mono">{selectedImportFile.name}</p>
                      <p className="text-[11px] text-emerald-700 font-medium">
                        {(selectedImportFile.size / 1024).toFixed(1)} KB — Click to change file
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-slate-800">Click to choose workspace JSON backup</p>
                      <p className="text-[11px] text-slate-500">Supports .json files exported from Enquiry Manager</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Import Strategy Segmented Mode Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. Select Import Strategy / Mode *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option 1: Merge & Append */}
                  <div
                    onClick={() => {
                      setImportMode('merge');
                      setConfirmWipeCheck(false);
                    }}
                    className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                      importMode === 'merge'
                        ? 'bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="text-emerald-600 text-base">🟢</span> Merge & Append
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Default
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Retains existing data and merges backup. Matching document IDs will be updated and new records appended.
                    </p>
                  </div>

                  {/* Option 2: Wipe & Replace */}
                  <div
                    onClick={() => setImportMode('replace')}
                    className={`p-3.5 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between ${
                      importMode === 'replace'
                        ? 'bg-rose-50/60 border-rose-500 ring-1 ring-rose-500 shadow-sm'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span className="text-rose-600 text-base">🔴</span> Wipe & Replace
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                        Destructive
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Clears workspace data before restoring backup. Existing records in this workspace will be deleted first.
                    </p>
                  </div>
                </div>
              </div>

              {/* High-Contrast Red Warning Box & Mandatory Confirmation Checkbox */}
              {importMode === 'replace' && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                  <div className="flex items-start space-x-2.5 text-xs text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <p className="font-semibold leading-relaxed">
                      ⚠️ Warning: Restoring in Wipe & Replace mode will permanently delete all existing companies, contacts, enquiries, activity logs, and products in this workspace before importing.
                    </p>
                  </div>

                  <label className="flex items-center space-x-2.5 text-xs text-slate-900 font-bold cursor-pointer pt-2 border-t border-rose-200/80">
                    <input
                      type="checkbox"
                      checked={confirmWipeCheck}
                      onChange={(e) => setConfirmWipeCheck(e.target.checked)}
                      className="w-4 h-4 text-rose-600 rounded border-rose-300 focus:ring-rose-500"
                    />
                    <span>I understand that all current workspace data will be erased.</span>
                  </label>
                </div>
              )}

              {/* Footer Action Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportingJson(false);
                    setSelectedImportFile(null);
                    setConfirmWipeCheck(false);
                    setImportMode('merge');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedImportFile || isRestoring || (importMode === 'replace' && !confirmWipeCheck)}
                  onClick={handleExecuteImport}
                  className={`px-5 py-2.5 text-xs font-semibold rounded-xl shadow-sm transition flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    importMode === 'replace'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  <Download className="w-4 h-4 rotate-180" />
                  <span>{isRestoring ? 'Restoring Workspace...' : 'Restore From Backup JSON'}</span>
                </button>
              </div>
            </div>
          ) : !isCreating ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                  Your Workspaces ({workspaces.length})
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setIsImportingJson(true);
                      setImportMode('merge');
                      setConfirmWipeCheck(false);
                    }}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition"
                    title="Import workspace JSON backup"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600 rotate-180" />
                    <span>Import JSON</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsJoining(true);
                      setJoinCode('');
                    }}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition"
                  >
                    <Key className="w-3.5 h-3.5 text-blue-600" />
                    <span>Join with Invite Code</span>
                  </button>
                  <button
                    onClick={startCreate}
                    className="flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Workspace</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {workspaces.map((ws) => {
                  const isActive = ws?.id === activeWorkspaceId;
                  const wsName = ws?.name || 'Untitled Workspace';
                  const wsInitials = (wsName || 'WS').substring(0, 2).toUpperCase();
                  return (
                    <React.Fragment key={ws?.id || Math.random().toString()}>
                      <div
                        className={`p-4 rounded-xl border transition flex items-center justify-between ${
                          isActive
                            ? 'bg-blue-50/60 border-blue-500 shadow-sm ring-1 ring-blue-500'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm ${
                              isActive
                                ? 'bg-blue-600 text-white shadow'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {wsInitials}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center space-x-2">
                              <h4 className="font-bold text-slate-900 truncate">{wsName}</h4>
                              {isActive && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 truncate mt-0.5">
                              {ws.description || 'No description provided.'}
                            </p>
                            <div className="flex items-center space-x-2 mt-2">
                              <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {ws.modules?.enquiriesEnabled !== false
                                  ? 'Enquiries & Quotes'
                                  : 'Call/Service Only (No Quotes)'}
                              </span>
                              <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                Activity Logs Enabled
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={async () => {
                              try {
                                triggerToast(`Exporting data for ${wsName}...`, 'info');
                                const exportData = await exportWorkspaceData(ws.id, ws.name);
                                const sanitized = wsName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                                const fileName = `workspace_export_${sanitized}_${new Date().toISOString().slice(0, 10)}.json`;
                                downloadJsonFile(fileName, exportData);
                                triggerToast(`Exported ${wsName} JSON backup with ${exportData.counts.call_logs || 0} activity logs!`, 'success');
                              } catch (err: any) {
                                triggerToast(`Export failed: ${err.message}`, 'error');
                              }
                            }}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition"
                            title="Export Workspace JSON Backup"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startEdit(ws)}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition"
                            title="Edit Workspace Settings"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {workspaces.length > 1 && (
                            <button
                              onClick={() => toggleDeleteWorkspace(ws)}
                              className={`p-2 rounded-lg border transition ${
                                deletingWs?.id === ws.id
                                  ? 'text-rose-700 bg-rose-100 border-rose-300'
                                  : 'text-rose-500 hover:text-rose-700 hover:bg-rose-50 border-slate-200'
                              }`}
                              title="Delete Workspace"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {!isActive && (
                            <button
                              onClick={() => {
                                onSelectWorkspace(ws.id);
                                triggerToast(`Switched to ${ws.name}`, 'info');
                              }}
                              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition"
                            >
                              Switch
                            </button>
                          )}
                        </div>
                      </div>

                      {deletingWs?.id === ws.id && (
                        <div className="p-4 bg-rose-50/90 border border-rose-300 rounded-xl space-y-3 animate-fade-in my-1 shadow-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 text-rose-800">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              <h4 className="text-xs font-bold uppercase tracking-wider">
                                Workspace Deletion Warning & Data Breakdown
                              </h4>
                            </div>
                            <button
                              onClick={() => {
                                setDeletingWs(null);
                                setShowSecondaryPurgeCheck(false);
                              }}
                              className="p-1 text-rose-400 hover:text-rose-700 rounded-lg text-xs"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {deleteLoading ? (
                            <div className="flex items-center space-x-2 text-xs text-rose-700 py-2 font-medium">
                              <div className="w-4 h-4 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
                              <span>Analyzing workspace records and compiling data breakdown...</span>
                            </div>
                          ) : (
                            <>
                              {/* Data Breakdown Warning Box */}
                              <div className="p-3 bg-white/90 border border-rose-200 rounded-lg text-xs text-slate-800 space-y-1.5 shadow-2xs">
                                <p className="font-bold text-rose-900">
                                  Deleting "{ws.name}" will permanently erase all assigned workspace data:
                                </p>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                                  <div className="px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded text-slate-800">
                                    <span className="font-bold text-rose-700">{deleteCounts?.companies ?? 0}</span> Companies
                                  </div>
                                  <div className="px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded text-slate-800">
                                    <span className="font-bold text-rose-700">{deleteCounts?.contacts ?? 0}</span> Contacts
                                  </div>
                                  <div className="px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded text-slate-800">
                                    <span className="font-bold text-rose-700">{deleteCounts?.enquiries ?? 0}</span> Enquiries
                                  </div>
                                  <div className="px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded text-slate-800">
                                    <span className="font-bold text-rose-700">{deleteCounts?.call_logs ?? 0}</span> Activity Logs
                                  </div>
                                  <div className="px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded text-slate-800">
                                    <span className="font-bold text-rose-700">{deleteCounts?.products ?? 0}</span> Products
                                  </div>
                                  <div className="px-2.5 py-1.5 bg-rose-50 border border-rose-100 rounded text-slate-800">
                                    <span className="font-bold text-rose-700">{deleteCounts?.salespersons ?? 0}</span> Salespersons
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons or Secondary Confirmation */}
                              {!showSecondaryPurgeCheck ? (
                                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeletingWs(null);
                                      setShowSecondaryPurgeCheck(false);
                                    }}
                                    className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition"
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setShowSecondaryPurgeCheck(true)}
                                    disabled={isPurging}
                                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-xs font-bold rounded-lg transition flex items-center space-x-1.5 disabled:opacity-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Purge Without Backup</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={handleDownloadBackupAndPurge}
                                    disabled={isPurging}
                                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center space-x-1.5 disabled:opacity-50"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>{isPurging ? 'Purging...' : 'Download JSON Backup & Purge Workspace'}</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="p-3 bg-rose-100 border border-rose-300 rounded-lg space-y-2 text-xs animate-fade-in">
                                  <p className="font-bold text-rose-900 flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                    <span>Secondary Safety Confirmation</span>
                                  </p>
                                  <p className="text-rose-800">
                                    Are you sure you want to permanently purge <strong>"{ws.name}"</strong> without a backup? All records listed above will be permanently destroyed.
                                  </p>
                                  <div className="flex items-center justify-end space-x-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setShowSecondaryPurgeCheck(false)}
                                      className="px-3 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg"
                                    >
                                      Go Back
                                    </button>
                                    <button
                                      type="button"
                                      onClick={confirmPurgeWithoutBackup}
                                      disabled={isPurging}
                                      className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-lg shadow-xs flex items-center space-x-1"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>{isPurging ? 'Purging...' : 'Yes, Confirm Purge Without Backup'}</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-900 text-base">
                  {editingWorkspace ? `Edit Workspace: ${editingWorkspace.name}` : 'Create New Workspace'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="text-xs text-slate-500 hover:text-slate-900 font-semibold"
                >
                  Cancel & Back
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Aventura Trading LLC or Service Ops"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Notes
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Technical Equipment Sales & Service Division"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* Module Config Section */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Module Configuration</span>
                </h4>
                <p className="text-xs text-slate-500">
                  Configure enabled features for this workspace context.
                </p>

                <div className="space-y-2 pt-1">
                  <label className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Enquiries & Quotation Engine</span>
                      <span className="text-[11px] text-slate-500 block">
                        Line items, proposal options, PDF quote refs, product catalog. (Disable for pure service/call businesses).
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enquiriesEnabled}
                      onChange={(e) => setEnquiriesEnabled(e.target.checked)}
                      className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-200 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Activity Log & Operator Queue Engine</span>
                      <span className="text-[11px] text-slate-500 block">
                        Top-level interaction scheduling, contact resolution flow, DNC suppression, and fast operator queue across all 5 activity channels.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={callLogEnabled}
                      onChange={(e) => setCallLogEnabled(e.target.checked)}
                      className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>

              {/* Configurable Geography Field */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-blue-600" />
                  <span>Configurable Geography / Regions (One per line)</span>
                </label>
                <textarea
                  rows={4}
                  value={geographyText}
                  onChange={(e) => setGeographyText(e.target.value)}
                  className="w-full p-3 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="Dubai, UAE&#10;Abu Dhabi, UAE&#10;Saudi Arabia (KSA)..."
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center space-x-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : editingWorkspace ? 'Save Changes' : 'Create Workspace'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
