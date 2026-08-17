import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, UserRole, Workspace, WorkspaceMember, Enquiry, Salesperson, CallLogEntry, getInitials } from '../types';
import { db, safeUpdateDoc, safeDeleteDoc, safeSetDoc } from '../firebase';
import { collection, doc, onSnapshot, writeBatch, query, where, getDocs, arrayRemove } from 'firebase/firestore';
import { recordAuditLog } from '../utils/auditLogger';
import { getUserRoleInWorkspace } from '../utils/permissions';
import ReassignOpenRecordsModal, { TargetTeamMember } from './ReassignOpenRecordsModal';
import {
  Users,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  Building,
  UserCheck,
  UserX,
  Edit,
  Trash2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Info
} from 'lucide-react';

interface UserManagementHubProps {
  currentUser: UserProfile;
  workspaces: Workspace[];
  activeWorkspace?: Workspace;
  enquiries?: Enquiry[];
  salespersons?: Salesperson[];
  callLogs?: CallLogEntry[];
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function UserManagementHub({
  currentUser,
  workspaces,
  activeWorkspace,
  enquiries = [],
  salespersons = [],
  callLogs = [],
  setEnquiries,
  setCallLogs,
  triggerToast
}: UserManagementHubProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Member');
  const [editBlocked, setEditBlocked] = useState<boolean>(false);
  const [editWorkspaces, setEditWorkspaces] = useState<string[]>([]);
  const [editDataVisibilityScope, setEditDataVisibilityScope] = useState<'ALL_DATA' | 'OWN_DATA_ONLY'>('ALL_DATA');
  const [editDataVisibilityTier, setEditDataVisibilityTier] = useState<'ADVANCED' | 'BASIC'>('ADVANCED');
  const [editAllowSalespersonSelection, setEditAllowSalespersonSelection] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  // User Deletion State
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Live Subscription to 'users' collection in Firestore
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as UserProfile;
          list.push({
            ...data,
            uid: docSnap.id
          });
        });
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Error fetching users collection:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // Admin Promotion Confirmation Modal state
  const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);

  const activeWsId = activeWorkspace?.id || currentUser.defaultWorkspaceId || 'ws_default';

  // Live Read-Only Subscription to active workspace document for instant roster updates
  const [liveWorkspaceMembers, setLiveWorkspaceMembers] = useState<WorkspaceMember[]>([]);

  useEffect(() => {
    if (!activeWsId) return;
    const unsub = onSnapshot(
      doc(db, 'workspaces', activeWsId),
      (docSnap) => {
        if (docSnap.exists()) {
          const wsData = docSnap.data();
          const members = Array.isArray(wsData?.members) ? wsData.members : [];
          setLiveWorkspaceMembers(members);
        }
      },
      (err) => {
        console.warn('Error listening to active workspace snapshot:', err);
      }
    );
    return () => unsub();
  }, [activeWsId]);

  // Combine users collection and live workspace members array for complete roster visibility
  const effectiveUsers = useMemo(() => {
    const list = [...users];
    const existingUids = new Set(list.map((u) => u.uid));
    const existingEmails = new Set(list.map((u) => (u.email || '').trim().toLowerCase()));

    liveWorkspaceMembers.forEach((m) => {
      const emailLower = (m.email || '').trim().toLowerCase();
      if (!existingUids.has(m.uid) && (!emailLower || !existingEmails.has(emailLower))) {
        list.push({
          uid: m.uid,
          email: m.email || '',
          username: m.name || m.full_name || (m.email ? m.email.split('@')[0] : 'Member'),
          full_name: m.full_name || m.name,
          role: m.role || 'Member',
          workspaceIds: [activeWsId],
          workspace_roles: { [activeWsId]: m.role || 'Member' },
          createdAt: m.joined_at || new Date().toISOString()
        });
        existingUids.add(m.uid);
        if (emailLower) existingEmails.add(emailLower);
      }
    });

    return list;
  }, [users, liveWorkspaceMembers, activeWsId]);

  const handleOpenEdit = (u: UserProfile) => {
    setEditingUser(u);
    const uRole = getUserRoleInWorkspace(u, activeWsId);
    setEditRole(uRole);
    setEditBlocked(!!u.blocked);
    setEditWorkspaces(u.workspaceIds || ['ws_default']);
    setEditDataVisibilityScope(u.dataVisibilityScope || 'ALL_DATA');
    setEditDataVisibilityTier(u.dataVisibilityTier || 'ADVANCED');
    setEditAllowSalespersonSelection(u.allowSalespersonSelection !== false);
  };

  const handleToggleWorkspace = (wsId: string) => {
    setEditWorkspaces((prev) =>
      prev.includes(wsId) ? prev.filter((id) => id !== wsId) : [...prev, wsId]
    );
  };

  const executeSaveUser = async (roleToSave: UserRole) => {
    if (!editingUser) return;
    setSaving(true);
    try {
      const currentRoles = editingUser.workspace_roles || {};
      const updatedWorkspaceRoles = {
        ...currentRoles,
        [activeWsId]: roleToSave
      };

      const payload = {
        role: editingUser.role || roleToSave,
        workspace_roles: updatedWorkspaceRoles,
        blocked: editBlocked,
        workspaceIds: editWorkspaces,
        dataVisibilityScope: editDataVisibilityScope,
        dataVisibilityTier: editDataVisibilityTier,
        allowSalespersonSelection: editAllowSalespersonSelection
      };

      await safeUpdateDoc('users', editingUser.uid, payload);

      // Also update workspace members roster in activeWorkspace if applicable
      if (activeWorkspace && activeWorkspace.id) {
        const members = Array.isArray(activeWorkspace.members) ? activeWorkspace.members : [];
        const hasMember = members.some(m => m.uid === editingUser.uid || (m.email && m.email.toLowerCase() === editingUser.email?.toLowerCase()));
        if (hasMember) {
          const updatedMembers = members.map(m => 
            m.uid === editingUser.uid || (m.email && m.email.toLowerCase() === editingUser.email?.toLowerCase())
              ? { ...m, role: roleToSave }
              : m
          );
          await safeUpdateDoc('workspaces', activeWorkspace.id, { members: updatedMembers });
        }
      }

      // Also update local cache for immediate feedback
      const cachedRaw = localStorage.getItem(`omni_user_${editingUser.uid}`);
      if (cachedRaw) {
        try {
          const parsed = JSON.parse(cachedRaw);
          localStorage.setItem(`omni_user_${editingUser.uid}`, JSON.stringify({ ...parsed, ...payload }));
        } catch (e) {}
      }

      await recordAuditLog({
        document_id: editingUser.uid,
        entity_type: 'user',
        entity_title: editingUser.username || editingUser.email,
        action: 'update',
        user: currentUser,
        before: editingUser,
        after: { ...editingUser, ...payload },
        details: `Updated user profile (${editingUser.email}): Role -> ${roleToSave}, Visibility -> ${editDataVisibilityScope}, Status -> ${editBlocked ? 'Blocked' : 'Active'}`
      });

      if (triggerToast) {
        triggerToast(`Updated user profile for ${editingUser.email}`, 'success');
      }
      setEditingUser(null);
      setShowPromoteConfirm(false);
    } catch (err: any) {
      console.error('Failed to update user profile:', err);
      if (triggerToast) {
        triggerToast('Failed to update user: ' + err.message, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    // If attempting to promote a non-admin to Admin, ask for explicit confirmation
    if (editRole === 'Admin' && editingUser.role !== 'Admin') {
      setShowPromoteConfirm(true);
      return;
    }

    await executeSaveUser(editRole);
  };

  // Reassign Modal State for User Deletion
  const [reassignModalState, setReassignModalState] = useState<{
    isOpen: boolean;
    userToDelete: UserProfile | null;
    openEnquiryCount: number;
    pendingActivityCount: number;
    openEnquiries: Enquiry[];
    pendingLogs: CallLogEntry[];
  }>({
    isOpen: false,
    userToDelete: null,
    openEnquiryCount: 0,
    pendingActivityCount: 0,
    openEnquiries: [],
    pendingLogs: [],
  });
  const [isReassignSubmitting, setIsReassignSubmitting] = useState(false);

  const performActualUserDelete = async (u: UserProfile) => {
    const userEmail = u.email;
    const userUid = u.uid;

    if (userUid && !userUid.startsWith('local_')) {
      const batch = writeBatch(db);

      // 1. Query workspace_members where email == u.email OR user_id == u.uid
      if (userEmail) {
        const wmSnap1 = await getDocs(query(collection(db, 'workspace_members'), where('email', '==', userEmail)));
        wmSnap1.forEach((d) => batch.delete(d.ref));
      }
      if (userUid) {
        const wmSnap2 = await getDocs(query(collection(db, 'workspace_members'), where('user_id', '==', userUid)));
        wmSnap2.forEach((d) => batch.delete(d.ref));
      }

      // 2. Query salespersons where email == u.email OR uid == u.uid
      if (userEmail) {
        const spSnap1 = await getDocs(query(collection(db, 'salespersons'), where('email', '==', userEmail)));
        spSnap1.forEach((d) => batch.delete(d.ref));
      }
      if (userUid) {
        const spSnap2 = await getDocs(query(collection(db, 'salespersons'), where('uid', '==', userUid)));
        spSnap2.forEach((d) => batch.delete(d.ref));
      }

      // 3. Query workspaces where members or member_emails array contains u.email
      const wsSnap = await getDocs(collection(db, 'workspaces'));
      wsSnap.forEach((docSnap) => {
        const wsData = docSnap.data();
        const ref = docSnap.ref;
        let needsUpdate = false;
        const updatePayload: any = {};

        if (userEmail) {
          if (Array.isArray(wsData.member_emails) && wsData.member_emails.includes(userEmail)) {
            updatePayload.member_emails = arrayRemove(userEmail);
            needsUpdate = true;
          }
          if (Array.isArray(wsData.members)) {
            const filteredMembers = wsData.members.filter(
              (m: any) => m.uid !== userUid && (!m.email || m.email.toLowerCase() !== userEmail.toLowerCase())
            );
            if (filteredMembers.length !== wsData.members.length) {
              updatePayload.members = filteredMembers;
              needsUpdate = true;
            }
          }
        }

        if (needsUpdate) {
          batch.update(ref, updatePayload);
        }
      });

      // 4. Delete user document
      batch.delete(doc(db, 'users', userUid));

      // 5. Commit batch
      await batch.commit();
    } else if (userUid) {
      await safeDeleteDoc('users', userUid);
    }

    await recordAuditLog({
      document_id: u.uid,
      entity_type: 'user',
      entity_title: u.username || u.email,
      action: 'delete',
      user: currentUser,
      before: u,
      after: null,
      details: `Deleted user account permanently (${u.email}, role: ${u.role})`
    });

    if (triggerToast) {
      triggerToast(`User account ${u.email} has been permanently deleted.`, 'success');
    }

    if (editingUser?.uid === u.uid) {
      setEditingUser(null);
    }
    setDeletingUser(null);
  };

  const handleInitiateDeleteUser = (u: UserProfile) => {
    if (u.uid === currentUser.uid) {
      if (triggerToast) {
        triggerToast('You cannot delete your own active administrator account.', 'error');
      }
      return;
    }

    // Match sales representative document for this user (if any)
    const userSp = (salespersons || []).find(
      (s) =>
        s.linked_user_id === u.uid ||
        (u.email && s.email && u.email.toLowerCase() === s.email.toLowerCase()) ||
        (u.initials && s.initials && u.initials.toUpperCase() === s.initials.toUpperCase()) ||
        (u.full_name && s.full_name && u.full_name.toLowerCase() === s.full_name.toLowerCase())
    );

    // Identify open enquiries (status === 'Active')
    const openEnquiries = (enquiries || []).filter(
      (e) =>
        e.status === 'Active' &&
        (e.sales_person === u.uid ||
          e.createdByUid === u.uid ||
          (u.initials && e.sales_person?.toUpperCase() === u.initials.toUpperCase()) ||
          (u.full_name && e.sales_person?.toLowerCase() === u.full_name.toLowerCase()) ||
          (userSp &&
            (e.sales_person === userSp.id ||
              (userSp.initials && e.sales_person?.toUpperCase() === userSp.initials.toUpperCase()))))
    );

    // Identify pending activity logs
    const pendingLogs = (callLogs || []).filter(
      (c) =>
        (c.status === 'Scheduled' ||
          c.status === 'Follow-Up Required' ||
          Boolean(c.next_followup_date)) &&
        ((c as any).sales_person_id === u.uid ||
          c.logged_by === u.uid ||
          (u.initials && c.sales_person?.toUpperCase() === u.initials.toUpperCase()) ||
          (u.full_name && c.sales_person?.toLowerCase() === u.full_name.toLowerCase()) ||
          (userSp &&
            ((c as any).sales_person_id === userSp.id ||
              (userSp.initials && c.sales_person?.toUpperCase() === userSp.initials.toUpperCase()))))
    );

    if (openEnquiries.length > 0 || pendingLogs.length > 0) {
      setReassignModalState({
        isOpen: true,
        userToDelete: u,
        openEnquiryCount: openEnquiries.length,
        pendingActivityCount: pendingLogs.length,
        openEnquiries,
        pendingLogs,
      });
      return;
    }

    // No open records -> show standard deletion confirmation
    setDeletingUser(u);
  };

  const handleReassignAndDeleteUser = async (reassignToSalespersonId: string) => {
    const u = reassignModalState.userToDelete;
    if (!u) return;

    const targetSp = (salespersons || []).find(
      (s) => s.id === reassignToSalespersonId || s.initials === reassignToSalespersonId
    );
    const targetInitials = targetSp?.initials || (targetSp ? getInitials(targetSp.full_name) : 'UN');
    const targetId = targetSp?.id || reassignToSalespersonId;
    const targetName = targetSp?.full_name || 'Team Member';

    setIsReassignSubmitting(true);
    try {
      // 1. Reassign open enquiries
      const openEnqIds = new Set(reassignModalState.openEnquiries.map((e) => e.id).filter(Boolean));
      for (const eq of reassignModalState.openEnquiries) {
        if (eq.id) {
          await safeUpdateDoc('enquiries', eq.id, {
            sales_person: targetInitials,
            sales_person_id: targetId,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (setEnquiries) {
        setEnquiries((prev) =>
          prev.map((eq) => {
            if (eq.id && openEnqIds.has(eq.id)) {
              return { ...eq, sales_person: targetInitials, sales_person_id: targetId };
            }
            return eq;
          })
        );
      }

      // 2. Reassign pending call logs / activity logs
      const pendingLogIds = new Set(reassignModalState.pendingLogs.map((l) => l.id).filter(Boolean));
      for (const cl of reassignModalState.pendingLogs) {
        if (cl.id) {
          await safeUpdateDoc('call_logs', cl.id, {
            sales_person: targetInitials,
            sales_person_id: targetId,
            handled_by_salesperson_id: targetId,
            handled_by_team_member_name: targetName,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (setCallLogs) {
        setCallLogs((prev) =>
          prev.map((cl) => {
            if (cl.id && pendingLogIds.has(cl.id)) {
              return {
                ...cl,
                sales_person: targetInitials,
                sales_person_id: targetId,
                handled_by_salesperson_id: targetId,
                handled_by_team_member_name: targetName,
              };
            }
            return cl;
          })
        );
      }

      // 3. Delete user document
      await performActualUserDelete(u);
      setReassignModalState((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      if (triggerToast) {
        triggerToast('Failed to reassign records and delete user: ' + (err?.message || err), 'error');
      }
    } finally {
      setIsReassignSubmitting(false);
    }
  };

  const handleDirectDeleteUser = async () => {
    const u = reassignModalState.userToDelete;
    if (!u) return;

    setIsReassignSubmitting(true);
    try {
      // 1. Unassign open enquiries
      const openEnqIds = new Set(reassignModalState.openEnquiries.map((e) => e.id).filter(Boolean));
      for (const eq of reassignModalState.openEnquiries) {
        if (eq.id) {
          await safeUpdateDoc('enquiries', eq.id, {
            sales_person: '',
            sales_person_id: '',
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (setEnquiries) {
        setEnquiries((prev) =>
          prev.map((eq) => {
            if (eq.id && openEnqIds.has(eq.id)) {
              return { ...eq, sales_person: '', sales_person_id: '' };
            }
            return eq;
          })
        );
      }

      // 2. Unassign pending call logs
      const pendingLogIds = new Set(reassignModalState.pendingLogs.map((l) => l.id).filter(Boolean));
      for (const cl of reassignModalState.pendingLogs) {
        if (cl.id) {
          await safeUpdateDoc('call_logs', cl.id, {
            sales_person: '',
            sales_person_id: '',
            handled_by_salesperson_id: '',
            handled_by_team_member_name: '',
            updatedAt: new Date().toISOString(),
          });
        }
      }
      if (setCallLogs) {
        setCallLogs((prev) =>
          prev.map((cl) => {
            if (cl.id && pendingLogIds.has(cl.id)) {
              return {
                ...cl,
                sales_person: '',
                sales_person_id: '',
                handled_by_salesperson_id: '',
                handled_by_team_member_name: '',
              };
            }
            return cl;
          })
        );
      }

      // 3. Delete user document
      await performActualUserDelete(u);
      setReassignModalState((prev) => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      if (triggerToast) {
        triggerToast('Failed to unassign records and delete user: ' + (err?.message || err), 'error');
      }
    } finally {
      setIsReassignSubmitting(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    if (deletingUser.uid === currentUser.uid) {
      if (triggerToast) {
        triggerToast('You cannot delete your own active administrator account.', 'error');
      }
      setDeletingUser(null);
      return;
    }

    setDeleting(true);
    try {
      await performActualUserDelete(deletingUser);
    } catch (err: any) {
      console.error('Failed to delete user:', err);
      if (triggerToast) {
        triggerToast('Failed to delete user: ' + err.message, 'error');
      }
    } finally {
      setDeleting(false);
    }
  };

  // Detect any duplicate user emails across the roster
  const duplicateEmails = useMemo(() => {
    const emailCounts: Record<string, number> = {};
    effectiveUsers.forEach((u) => {
      const e = (u.email || '').trim().toLowerCase();
      if (e) {
        emailCounts[e] = (emailCounts[e] || 0) + 1;
      }
    });
    return Object.keys(emailCounts).filter((e) => emailCounts[e] > 1);
  }, [effectiveUsers]);

  const filteredUsers = effectiveUsers.filter((u) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.uid && u.uid.toLowerCase().includes(q));

    const evaluatedRole = getUserRoleInWorkspace(u, activeWsId, activeWorkspace);
    const matchesRole = roleFilter === 'ALL' || evaluatedRole === roleFilter || u.role === roleFilter;
    const matchesStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && !u.blocked) ||
      (statusFilter === 'BLOCKED' && u.blocked);

    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <div id="user-management-hub" className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">
              User Roster & Access Control
            </h1>
          </div>
          <p className="text-xs text-slate-500 font-sans mt-1">
            Monitor registered platform users, manage permissions, toggle account status, and assign workspace access.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Total Registered: <strong className="text-slate-900">{users.length}</strong></span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email or UID..."
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl focus:outline-none"
          >
            <option value="ALL">All Roles</option>
            <option value="Admin">Admin Only</option>
            <option value="Member">Member Only</option>
            <option value="Viewer">Viewer Only</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 text-xs font-semibold text-slate-700 px-3 py-2 rounded-xl focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Users</option>
            <option value="BLOCKED">Suspended / Blocked</option>
          </select>
        </div>
      </div>

      {/* Duplicate Email Warning Banner */}
      {duplicateEmails.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start space-x-3 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-amber-900 text-sm">
              Account Duplication Detected ({duplicateEmails.length} duplicate email{duplicateEmails.length > 1 ? 's' : ''})
            </h4>
            <p className="text-amber-800">
              Multiple user profile entries share the same email address ({duplicateEmails.join(', ')}). You can delete duplicate profiles using the Delete Account option below to maintain strict 1-account-per-user integrity.
            </p>
          </div>
        </div>
      )}

      {/* Users Roster Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span className="text-xs font-mono">Loading User Directory...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-sans text-xs italic">
            No user profiles found matching filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">User Details</th>
                  <th className="py-3 px-4">System Role</th>
                  <th className="py-3 px-4">Access Status</th>
                  <th className="py-3 px-4">Workspaces Access</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredUsers.map((u) => {
                  const isSelf = u?.uid === currentUser?.uid;
                  const displayName = u?.username || u?.full_name || (u?.email ? u.email.split('@')[0] : 'User');
                  const userInitials = (displayName || 'U').charAt(0).toUpperCase();
                  const evaluatedRole = getUserRoleInWorkspace(u, activeWsId, activeWorkspace);
                  return (
                    <tr key={u?.uid || Math.random().toString()} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                            evaluatedRole === 'Admin' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {userInitials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center space-x-2">
                              <span>{displayName}</span>
                              {isSelf && (
                                <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-mono px-1.5 py-0.2 rounded font-bold">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">{u?.email || 'No Email'}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          evaluatedRole === 'Admin'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : evaluatedRole === 'Member'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          <Shield className="w-3 h-3" />
                          <span>{evaluatedRole}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        {u.blocked ? (
                          <span className="inline-flex items-center space-x-1 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-lg font-bold">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Suspended</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Active</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-600 font-sans">
                        <div className="flex flex-wrap gap-1">
                          {u.role === 'Admin' ? (
                            <span className="text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded font-bold">
                              All Workspaces (Admin)
                            </span>
                          ) : (u.workspaceIds || ['ws_default']).map((id) => {
                            const ws = workspaces.find((w) => w.id === id);
                            return (
                              <span key={id} className="text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                                {ws ? ws.name : id}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => handleOpenEdit(u)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-xl font-semibold text-xs transition inline-flex items-center space-x-1.5"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Manage</span>
                          </button>

                          {currentUser.role === 'Admin' && !isSelf && (
                            <button
                              onClick={() => handleInitiateDeleteUser(u)}
                              title="Delete user account"
                              className="p-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 border border-slate-200 rounded-xl font-semibold text-xs transition inline-flex items-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-red-600" />
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
        )}
      </div>

      {/* EDIT USER PERMISSIONS MODAL */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Manage User Account</h3>
                  <p className="text-xs text-slate-500 font-mono">{editingUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              {/* Role Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Assigned System Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="Admin">Admin (Full Control, Dropdown & System Management)</option>
                  <option value="Member">Member (Standard Create / Edit Operator)</option>
                  <option value="Viewer">Viewer (Read-Only Access)</option>
                </select>
              </div>

              {/* Per-User Data Visibility Scope */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Data Visibility Scope
                </label>
                <div className="space-y-2">
                  <label className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                    editDataVisibilityScope === 'ALL_DATA'
                      ? 'bg-blue-50/70 border-blue-300 text-blue-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="dataVisibility"
                      checked={editDataVisibilityScope === 'ALL_DATA'}
                      onChange={() => setEditDataVisibilityScope('ALL_DATA')}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-xs font-bold block">All Workspace Data</span>
                      <span className="text-[11px] text-slate-500 block leading-tight">Can view all inquiries, call logs, and customer profiles in active workspace.</span>
                    </div>
                  </label>

                  <label className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition ${
                    editDataVisibilityScope === 'OWN_DATA_ONLY'
                      ? 'bg-amber-50/70 border-amber-300 text-amber-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <input
                      type="radio"
                      name="dataVisibility"
                      checked={editDataVisibilityScope === 'OWN_DATA_ONLY'}
                      onChange={() => setEditDataVisibilityScope('OWN_DATA_ONLY')}
                      className="mt-0.5 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <span className="text-xs font-bold block">Own Attributed Data Only</span>
                      <span className="text-[11px] text-slate-500 block leading-tight">Strictly restricted to records created by or assigned to this operator.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Information Detail Tier */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Information Detail Tier
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                    editDataVisibilityTier === 'ADVANCED'
                      ? 'bg-blue-50/70 border-blue-300 text-blue-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="dataVisibilityTier"
                        checked={editDataVisibilityTier === 'ADVANCED'}
                        onChange={() => setEditDataVisibilityTier('ADVANCED')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold">Advanced Detail</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 leading-tight">Full access to notes, financials, history, and audio logs.</span>
                  </label>

                  <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition ${
                    editDataVisibilityTier === 'BASIC'
                      ? 'bg-purple-50/70 border-purple-300 text-purple-900'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="dataVisibilityTier"
                        checked={editDataVisibilityTier === 'BASIC'}
                        onChange={() => setEditDataVisibilityTier('BASIC')}
                        className="text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-xs font-bold">Basic Detail</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 leading-tight">Restricted to name, designation, primary contact & status only.</span>
                  </label>
                </div>
              </div>

              {/* Status Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Account Status
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditBlocked(false)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center space-x-2 ${
                      !editBlocked
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>Active Account</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditBlocked(true)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center space-x-2 ${
                      editBlocked
                        ? 'bg-red-50 border-red-300 text-red-800'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <UserX className="w-4 h-4 text-red-600" />
                    <span>Suspend / Block</span>
                  </button>
                </div>
              </div>

              {/* Workspace Assignment */}
              {editRole !== 'Admin' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Assigned Workspaces
                  </label>
                  <div className="space-y-2 max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-3 bg-slate-50">
                    {workspaces.map((ws) => {
                      const checked = editWorkspaces.includes(ws.id);
                      return (
                        <label key={ws.id} className="flex items-center space-x-2.5 text-xs text-slate-700 font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleWorkspace(ws.id)}
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span>{ws.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-3">
                {currentUser.role === 'Admin' && editingUser.uid !== currentUser.uid && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = editingUser;
                      setEditingUser(null);
                      handleInitiateDeleteUser(target);
                    }}
                    className="py-2.5 px-3 border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-xl text-xs transition flex items-center space-x-1 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Account</span>
                  </button>
                )}

                <div className="flex items-center space-x-2 ml-auto w-full justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl text-xs hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Profile</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PROMOTE TO ADMIN CONFIRMATION MODAL */}
      {showPromoteConfirm && editingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-amber-600">
              <div className="p-2.5 bg-amber-50 border border-amber-100 rounded-xl shrink-0">
                <ShieldAlert className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Promote User to Administrator?</h3>
                <p className="text-xs text-slate-500 font-mono">{editingUser.email}</p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-2">
              <p className="text-xs text-amber-900 font-semibold leading-relaxed">
                Granting <strong>Administrator</strong> privileges gives <strong>{editingUser.full_name || editingUser.username || editingUser.email}</strong> full unrestricted control over:
              </p>
              <ul className="text-[11px] text-amber-800 space-y-1 list-disc list-inside">
                <li>All workspaces and data visibility settings</li>
                <li>User management, role promotions, and account deletions</li>
                <li>System configuration, audit logs, and data exports</li>
              </ul>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to promote this team member to Administrator?
            </p>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowPromoteConfirm(false)}
                disabled={saving}
                className="w-1/2 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeSaveUser('Admin')}
                disabled={saving}
                className="w-1/2 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50 shadow-md shadow-amber-200"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Promotion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REASSIGN OPEN RECORDS BEFORE DELETION MODAL */}
      <ReassignOpenRecordsModal
        isOpen={reassignModalState.isOpen}
        onClose={() => setReassignModalState((prev) => ({ ...prev, isOpen: false }))}
        representativeName={
          reassignModalState.userToDelete?.full_name ||
          reassignModalState.userToDelete?.username ||
          reassignModalState.userToDelete?.email ||
          'User'
        }
        openEnquiryCount={reassignModalState.openEnquiryCount}
        pendingActivityCount={reassignModalState.pendingActivityCount}
        availableTeamMembers={salespersons && salespersons.length > 0
          ? salespersons
              .filter((sp) => {
                const u = reassignModalState.userToDelete;
                if (!u) return true;
                return (
                  sp.linked_user_id !== u.uid &&
                  (!u.email || !sp.email || sp.email.toLowerCase() !== u.email.toLowerCase())
                );
              })
              .map((sp) => ({
                id: sp.id || sp.initials || '',
                name: sp.full_name,
                initials: sp.initials,
                role: sp.role,
              }))
          : effectiveUsers
              .filter((u) => u.uid !== reassignModalState.userToDelete?.uid)
              .map((u) => ({
                id: u.uid,
                name: u.full_name || u.username || u.email,
                initials: u.initials || (u.full_name ? getInitials(u.full_name) : 'UM'),
                role: u.role,
              }))}
        onReassignAndDelete={handleReassignAndDeleteUser}
        onDirectDelete={handleDirectDeleteUser}
        isSubmitting={isReassignSubmitting}
      />

      {/* DELETE USER CONFIRMATION MODAL */}
      {deletingUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="p-2.5 bg-red-50 border border-red-100 rounded-xl shrink-0">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete User Account?</h3>
                <p className="text-xs text-slate-500 font-mono">{deletingUser.email}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to permanently delete the account for{' '}
              <strong className="text-slate-900">{deletingUser.username || deletingUser.email}</strong>?
              This will remove their user profile doc from the directory and revoke their access permissions immediately.
            </p>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                disabled={deleting}
                className="w-1/2 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={deleting}
                className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1.5 disabled:opacity-50 shadow-md shadow-red-200"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{deleting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
