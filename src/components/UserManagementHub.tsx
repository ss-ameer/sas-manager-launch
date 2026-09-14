import React, { useState, useMemo } from 'react';
import {
  UserProfile,
  WorkspaceRole,
  Workspace,
  WorkspaceMember,
  Enquiry,
  Salesperson,
  CallLogEntry,
  Invite,
  getInitials
} from '../types';
import { safeGetDoc, safeUpdateDoc, safeSetDoc, safeDeleteDoc, safeAddDoc } from '../firebase';
import { getUserWorkspaceRole, normalizeWorkspaceRole } from '../utils/permissions';
import { recordAuditLog } from '../utils/auditLogger';
import { motion, AnimatePresence } from 'motion/react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Check,
  Copy,
  Trash2,
  UserMinus,
  ArrowRightLeft,
  X,
  Briefcase,
  Mail,
  KeyRound,
  Crown,
  Link2,
  Building,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Info,
  Filter
} from 'lucide-react';

export interface UnifiedTeamMember {
  uid: string;
  email: string;
  name: string;
  role: WorkspaceRole;
  salesperson_id?: string;
  joined_at?: string;
  isOwner: boolean;
  isCurrentUser: boolean;
}

export interface UserManagementHubProps {
  currentUser: UserProfile;
  workspaces?: Workspace[];
  activeWorkspace?: Workspace;
  enquiries?: Enquiry[];
  salespersons?: Salesperson[];
  callLogs?: CallLogEntry[];
  invites?: Invite[];
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  setInvites?: React.Dispatch<React.SetStateAction<Invite[]>>;
  setWorkspaces?: React.Dispatch<React.SetStateAction<Workspace[]>>;
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOpenHandoverWizard?: () => void;
}

export default function UserManagementHub({
  currentUser,
  workspaces = [],
  activeWorkspace,
  enquiries = [],
  salespersons = [],
  callLogs = [],
  invites = [],
  setEnquiries,
  setCallLogs,
  setInvites,
  setWorkspaces,
  setSalespersons,
  triggerToast,
  onOpenHandoverWizard
}: UserManagementHubProps) {
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | WorkspaceRole>('ALL');

  // Modal States
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteModalTab, setInviteModalTab] = useState<'join_code' | 'create_invite' | 'pending_invites'>('join_code');
  const [reassignModalMember, setReassignModalMember] = useState<UnifiedTeamMember | null>(null);
  const [revokeConfirmMember, setRevokeConfirmMember] = useState<UnifiedTeamMember | null>(null);

  // Invite Launcher States
  const [newInviteRole, setNewInviteRole] = useState<WorkspaceRole>('Member');
  const [newInviteNote, setNewInviteNote] = useState('');
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [recentlyGeneratedInvite, setRecentlyGeneratedInvite] = useState<Invite | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Reassignment Target State
  const [selectedTargetUid, setSelectedTargetUid] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [updatingRoleUid, setUpdatingRoleUid] = useState<string | null>(null);
  const [updatingSalespersonUid, setUpdatingSalespersonUid] = useState<string | null>(null);

  // Workspace owner UID
  const ownerUid = useMemo(() => {
    if (!activeWorkspace) return '';
    return (
      activeWorkspace.owner_uid ||
      (activeWorkspace as any).ownerUid ||
      activeWorkspace.created_by_uid ||
      ''
    ).trim();
  }, [activeWorkspace]);

  // Derived 6-Character Join Code
  const activeJoinCode = useMemo(() => {
    if (!activeWorkspace) return 'OMNI01';
    if (activeWorkspace.join_code) return activeWorkspace.join_code;
    const cleanId = (activeWorkspace.id || '').replace(/[^a-zA-Z0-9]/g, '');
    if (cleanId.length >= 6) {
      return cleanId.slice(-6).toUpperCase();
    }
    return ('WS' + cleanId + '999').slice(0, 6).toUpperCase();
  }, [activeWorkspace]);

  // 1. Quota-Optimized: Derive Unified Team Members strictly from activeWorkspace.members and local caches
  const teamMembers = useMemo<UnifiedTeamMember[]>(() => {
    if (!activeWorkspace) return [];

    const rawMembers = activeWorkspace.members;
    const list: UnifiedTeamMember[] = [];
    const seenUids = new Set<string>();

    const parseMember = (data: any, fallbackUid?: string): UnifiedTeamMember | null => {
      const uid = (data?.uid || data?.user_id || fallbackUid || '').trim();
      if (!uid) return null;

      const email = (data?.email || '').trim();
      let name = (
        data?.name ||
        data?.full_name ||
        data?.username ||
        (email ? email.split('@')[0] : '') ||
        'Team Member'
      ).trim();

      // Resolve role
      let role: WorkspaceRole = 'Member';
      if (uid === ownerUid) {
        role = 'Admin';
      } else if (data?.role) {
        const norm = normalizeWorkspaceRole(data.role);
        if (norm) role = norm;
      } else if (data?.workspace_roles?.[activeWorkspace.id]) {
        const norm = normalizeWorkspaceRole(data.workspace_roles[activeWorkspace.id]);
        if (norm) role = norm;
      }

      // Check local user cache if name or email is minimal
      let resolvedEmail = email;
      let resolvedName = name;
      try {
        const cached = localStorage.getItem(`omni_user_${uid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (!resolvedEmail && parsed.email) resolvedEmail = parsed.email;
          if (resolvedName === 'Team Member' && (parsed.full_name || parsed.username)) {
            resolvedName = parsed.full_name || parsed.username;
          }
        }
      } catch (e) {}

      if (uid === currentUser.uid) {
        if (!resolvedEmail && currentUser.email) resolvedEmail = currentUser.email;
        if (resolvedName === 'Team Member') {
          resolvedName =
            currentUser.full_name ||
            currentUser.username ||
            currentUser.email?.split('@')[0] ||
            'Current User';
        }
      }

      return {
        uid,
        email: resolvedEmail || 'No email registered',
        name: resolvedName,
        role,
        salesperson_id: data?.salesperson_id || data?.sales_person_id || '',
        joined_at: data?.joined_at || data?.createdAt || '',
        isOwner: uid === ownerUid || (Boolean(ownerUid) && uid === ownerUid),
        isCurrentUser: uid === currentUser.uid
      };
    };

    // A. Parse array-based members
    if (Array.isArray(rawMembers)) {
      rawMembers.forEach((m) => {
        const parsed = parseMember(m);
        if (parsed && !seenUids.has(parsed.uid)) {
          seenUids.add(parsed.uid);
          list.push(parsed);
        }
      });
    }
    // B. Parse object/map-based members
    else if (rawMembers && typeof rawMembers === 'object') {
      Object.entries(rawMembers).forEach(([key, val]) => {
        const parsed = parseMember(val, key);
        if (parsed && !seenUids.has(parsed.uid)) {
          seenUids.add(parsed.uid);
          list.push(parsed);
        }
      });
    }

    // C. Safeguard: Ensure owner_uid is represented even if members map was uninitialized
    if (ownerUid && !seenUids.has(ownerUid)) {
      seenUids.add(ownerUid);
      const isMe = ownerUid === currentUser.uid;
      list.unshift({
        uid: ownerUid,
        email: isMe ? (currentUser.email || '') : ((activeWorkspace as any).owner_email || 'owner@workspace.internal'),
        name: isMe ? (currentUser.full_name || currentUser.username || 'Workspace Owner') : (activeWorkspace.created_by || 'Workspace Owner'),
        role: 'Admin',
        salesperson_id: isMe ? ((currentUser as any).salesperson_id || '') : '',
        isOwner: true,
        isCurrentUser: isMe
      });
    }

    // D. Safeguard: Ensure currentUser is represented if currently operating in this workspace
    if (currentUser?.uid && !seenUids.has(currentUser.uid)) {
      seenUids.add(currentUser.uid);
      const myRole = getUserWorkspaceRole(currentUser, activeWorkspace.id, activeWorkspace);
      list.push({
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: currentUser.full_name || currentUser.username || currentUser.email?.split('@')[0] || 'You',
        role: myRole,
        salesperson_id: (currentUser as any).salesperson_id || '',
        isOwner: currentUser.uid === ownerUid,
        isCurrentUser: true
      });
    }

    return list;
  }, [activeWorkspace, currentUser, ownerUid]);

  // Compute active records (open enquiries) for a given member
  const getActiveRecordsForMember = (member: UnifiedTeamMember): Enquiry[] => {
    const linkedSp = salespersons.find((s) => s.id === member.salesperson_id);
    return enquiries.filter((e) => {
      if (e.is_deleted) return false;
      const isClosed = ['Order Received', 'Lost', 'Dead', 'Cancelled PO'].includes(e.status);
      if (isClosed) return false;

      // 1. Direct assignment
      if (e.assigned_to && e.assigned_to === member.uid) return true;
      if (e.created_by_uid && e.created_by_uid === member.uid) return true;

      // 2. Linked salesperson match
      if (member.salesperson_id) {
        if (e.sales_person_id === member.salesperson_id || e.salesperson_id === member.salesperson_id) return true;
        if (linkedSp?.full_name && e.sales_person?.toLowerCase() === linkedSp.full_name.toLowerCase()) return true;
      }
      return false;
    });
  };

  // Filtered members for rendering
  const filteredMembers = useMemo(() => {
    return teamMembers.filter((m) => {
      const q = searchQuery.toLowerCase().trim();
      const linkedSp = salespersons.find((s) => s.id === m.salesperson_id);
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.uid.toLowerCase().includes(q) ||
        (linkedSp && linkedSp.full_name.toLowerCase().includes(q));

      const matchesRole = roleFilter === 'ALL' || m.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [teamMembers, searchQuery, roleFilter, salespersons]);

  // Workspace-specific pending invites
  const workspaceInvites = useMemo(() => {
    if (!activeWorkspace?.id) return [];
    return invites.filter(
      (inv) =>
        (inv.workspaceId === activeWorkspace.id || (inv as any).workspace_id === activeWorkspace.id) &&
        !inv.used
    );
  }, [invites, activeWorkspace]);

  // Copy helper
  const handleCopy = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 2200);
    } else {
      setCopiedLink(text);
      setTimeout(() => setCopiedLink(null), 2200);
    }
    triggerToast?.(`Copied ${type === 'code' ? 'code' : 'link'} to clipboard!`, 'info');
  };

  // 2. Instant Role Persistence & State Synchronization
  const handleRoleChange = async (member: UnifiedTeamMember, newRole: WorkspaceRole) => {
    if (member.isCurrentUser) {
      triggerToast?.('Self-Demotion Guard: You cannot alter your own workspace role.', 'error');
      return;
    }
    if (member.isOwner) {
      triggerToast?.(
        'Owner Protection: The workspace owner role is immutable. Use the Ownership Handover Wizard to transfer ownership.',
        'error'
      );
      return;
    }
    if (!activeWorkspace?.id) return;

    setUpdatingRoleUid(member.uid);
    try {
      // A. Optimistic UI update in React context/state
      if (setWorkspaces) {
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id === activeWorkspace.id) {
              let updatedMembers: any;
              if (Array.isArray(w.members)) {
                const exists = w.members.some((m: any) => m.uid === member.uid);
                updatedMembers = exists
                  ? w.members.map((m: any) => (m.uid === member.uid ? { ...m, role: newRole } : m))
                  : [...w.members, { uid: member.uid, email: member.email, name: member.name, role: newRole }];
              } else if (w.members && typeof w.members === 'object') {
                updatedMembers = {
                  ...w.members,
                  [member.uid]: {
                    ...(w.members[member.uid] || {}),
                    uid: member.uid,
                    email: member.email,
                    name: member.name,
                    role: newRole
                  }
                };
              } else {
                updatedMembers = [{ uid: member.uid, email: member.email, name: member.name, role: newRole }];
              }
              return { ...w, members: updatedMembers };
            }
            return w;
          })
        );
      }

      // B. Persist atomically to workspaces/{workspaceId}
      const wsSnap = await safeGetDoc('workspaces', activeWorkspace.id);
      const wsData = wsSnap?.data() || {};
      let updatePayload: any = {};

      if (Array.isArray(wsData.members) || Array.isArray(activeWorkspace.members)) {
        const currentList: any[] = Array.isArray(wsData.members)
          ? wsData.members
          : Array.isArray(activeWorkspace.members)
          ? activeWorkspace.members
          : [];
        const exists = currentList.some((m: any) => m.uid === member.uid);
        const updatedList = exists
          ? currentList.map((m: any) => (m.uid === member.uid ? { ...m, role: newRole } : m))
          : [...currentList, { uid: member.uid, email: member.email, name: member.name, role: newRole }];
        updatePayload = { members: updatedList };
      } else {
        updatePayload = {
          [`members.${member.uid}.role`]: newRole,
          [`members.${member.uid}.uid`]: member.uid,
          [`members.${member.uid}.email`]: member.email,
          [`members.${member.uid}.name`]: member.name
        };
      }

      await safeUpdateDoc('workspaces', activeWorkspace.id, updatePayload);

      // C. Keep user profile doc synced if it exists
      try {
        await safeUpdateDoc('users', member.uid, {
          role: newRole,
          [`workspace_roles.${activeWorkspace.id}`]: newRole,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {}

      // D. Keep workspace_members record updated if present
      try {
        const wmDocId = `wm_${activeWorkspace.id}_${member.uid}`;
        await safeSetDoc(
          'workspace_members',
          wmDocId,
          {
            workspace_id: activeWorkspace.id,
            user_id: member.uid,
            uid: member.uid,
            email: member.email,
            name: member.name,
            role: newRole,
            updated_at: new Date().toISOString()
          },
          { merge: true }
        );
      } catch (e) {}

      // E. Audit log
      await recordAuditLog({
        document_id: member.uid,
        entity_type: 'user',
        entity_title: member.name || member.email,
        action: 'update',
        user: currentUser,
        details: `Updated workspace role for ${member.name} (${member.email}) to ${newRole} in ${activeWorkspace.name}`
      });

      triggerToast?.(`Updated role for ${member.name} to ${newRole}`, 'success');
    } catch (err: any) {
      console.error('Failed to persist role change:', err);
      triggerToast?.('Failed to update role: ' + (err?.message || err), 'error');
    } finally {
      setUpdatingRoleUid(null);
    }
  };

  // Linked Salesperson Profile change
  const handleLinkSalesperson = async (member: UnifiedTeamMember, salespersonId: string) => {
    if (!activeWorkspace?.id) return;
    setUpdatingSalespersonUid(member.uid);

    try {
      // A. Optimistic UI update
      if (setWorkspaces) {
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id === activeWorkspace.id) {
              let updatedMembers: any;
              if (Array.isArray(w.members)) {
                updatedMembers = w.members.map((m: any) =>
                  m.uid === member.uid ? { ...m, salesperson_id: salespersonId } : m
                );
              } else if (w.members && typeof w.members === 'object') {
                updatedMembers = {
                  ...w.members,
                  [member.uid]: {
                    ...(w.members[member.uid] || {}),
                    salesperson_id: salespersonId
                  }
                };
              }
              return { ...w, members: updatedMembers };
            }
            return w;
          })
        );
      }

      // B. Persist to Firestore workspaces/{workspaceId}
      const wsSnap = await safeGetDoc('workspaces', activeWorkspace.id);
      const wsData = wsSnap?.data() || {};
      if (Array.isArray(wsData.members) || Array.isArray(activeWorkspace.members)) {
        const currentList: any[] = Array.isArray(wsData.members)
          ? wsData.members
          : Array.isArray(activeWorkspace.members)
          ? activeWorkspace.members
          : [];
        const updatedList = currentList.map((m: any) =>
          m.uid === member.uid ? { ...m, salesperson_id: salespersonId } : m
        );
        await safeUpdateDoc('workspaces', activeWorkspace.id, { members: updatedList });
      } else {
        await safeUpdateDoc('workspaces', activeWorkspace.id, {
          [`members.${member.uid}.salesperson_id`]: salespersonId
        });
      }

      // C. Update salesperson doc linkage
      if (salespersonId) {
        await safeUpdateDoc('salespersons', salespersonId, {
          linked_user_id: member.uid,
          userId: member.uid,
          uid: member.uid,
          email: member.email,
          updatedAt: new Date().toISOString()
        });
        if (setSalespersons) {
          setSalespersons((prev) =>
            prev.map((sp) =>
              sp.id === salespersonId
                ? { ...sp, linked_user_id: member.uid, userId: member.uid, uid: member.uid }
                : sp
            )
          );
        }
        const rep = salespersons.find((s) => s.id === salespersonId);
        triggerToast?.(`Linked ${member.name} to sales rep ${rep?.full_name || salespersonId}`, 'success');
      } else {
        triggerToast?.(`Unlinked salesperson profile from ${member.name}`, 'info');
      }
    } catch (err: any) {
      console.error('Failed to link salesperson profile:', err);
      triggerToast?.('Failed to link salesperson: ' + (err?.message || err), 'error');
    } finally {
      setUpdatingSalespersonUid(null);
    }
  };

  // Reassign Deals Execution
  const handleExecuteReassignment = async () => {
    if (!reassignModalMember || !selectedTargetUid || !activeWorkspace?.id) return;
    const targetMember = teamMembers.find((m) => m.uid === selectedTargetUid);
    if (!targetMember) return;

    setIsReassigning(true);
    try {
      const openDeals = getActiveRecordsForMember(reassignModalMember);
      const targetSp = salespersons.find((s) => s.id === targetMember.salesperson_id);

      // Reassign open deals
      for (const deal of openDeals) {
        if (!deal.id) continue;
        const payload: any = {
          assigned_to: targetMember.uid,
          updatedAt: new Date().toISOString()
        };
        if (targetSp) {
          payload.sales_person = targetSp.full_name;
          payload.sales_person_id = targetSp.id;
          payload.salesperson_id = targetSp.id;
        }
        await safeUpdateDoc('enquiries', deal.id, payload);
      }

      // Optimistic update for enquiries
      if (setEnquiries) {
        const dealIds = new Set(openDeals.map((d) => d.id).filter(Boolean));
        setEnquiries((prev) =>
          prev.map((eq) => {
            if (eq.id && dealIds.has(eq.id)) {
              return {
                ...eq,
                assigned_to: targetMember.uid,
                sales_person: targetSp?.full_name || eq.sales_person,
                sales_person_id: targetSp?.id || eq.sales_person_id,
                salesperson_id: targetSp?.id || eq.salesperson_id
              };
            }
            return eq;
          })
        );
      }

      // Also reassign pending call logs if any
      const pendingLogs = callLogs.filter(
        (cl) =>
          cl.handled_by_salesperson_id === reassignModalMember.salesperson_id ||
          cl.sales_person === reassignModalMember.name
      );
      for (const log of pendingLogs) {
        if (!log.id) continue;
        const logPayload: any = {
          updatedAt: new Date().toISOString()
        };
        if (targetSp) {
          logPayload.sales_person = targetSp.full_name;
          logPayload.handled_by_salesperson_id = targetSp.id;
          logPayload.handled_by_team_member_name = targetMember.name;
        }
        await safeUpdateDoc('call_logs', log.id, logPayload);
      }

      if (setCallLogs && pendingLogs.length > 0) {
        const logIds = new Set(pendingLogs.map((l) => l.id).filter(Boolean));
        setCallLogs((prev) =>
          prev.map((cl) => {
            if (cl.id && logIds.has(cl.id)) {
              return {
                ...cl,
                sales_person: targetSp?.full_name || cl.sales_person,
                handled_by_salesperson_id: targetSp?.id || cl.handled_by_salesperson_id,
                handled_by_team_member_name: targetMember.name
              };
            }
            return cl;
          })
        );
      }

      await recordAuditLog({
        document_id: reassignModalMember.uid,
        entity_type: 'enquiry',
        entity_title: `Deal Reassignment (${openDeals.length} deals)`,
        action: 'update',
        user: currentUser,
        details: `Reassigned ${openDeals.length} active deals from ${reassignModalMember.name} to ${targetMember.name}`
      });

      triggerToast?.(
        `Successfully transferred ${openDeals.length} deal${openDeals.length === 1 ? '' : 's'} to ${targetMember.name}`,
        'success'
      );
      setReassignModalMember(null);
      setSelectedTargetUid('');
    } catch (err: any) {
      console.error('Failed to reassign deals:', err);
      triggerToast?.('Failed to reassign deals: ' + (err?.message || err), 'error');
    } finally {
      setIsReassigning(false);
    }
  };

  // Revoke Access Execution
  const handleExecuteRevoke = async () => {
    if (!revokeConfirmMember || !activeWorkspace?.id) return;
    if (revokeConfirmMember.isCurrentUser) {
      triggerToast?.('You cannot revoke your own workspace access.', 'error');
      return;
    }
    if (revokeConfirmMember.isOwner) {
      triggerToast?.(
        'Owner Protection: The workspace owner cannot be revoked without an Ownership Handover.',
        'error'
      );
      return;
    }

    setIsRevoking(true);
    try {
      // A. Optimistic state update
      if (setWorkspaces) {
        setWorkspaces((prev) =>
          prev.map((w) => {
            if (w.id === activeWorkspace.id) {
              let updatedMembers: any;
              if (Array.isArray(w.members)) {
                updatedMembers = w.members.filter((m: any) => m.uid !== revokeConfirmMember.uid);
              } else if (w.members && typeof w.members === 'object') {
                updatedMembers = { ...w.members };
                delete updatedMembers[revokeConfirmMember.uid];
              }
              return { ...w, members: updatedMembers };
            }
            return w;
          })
        );
      }

      // B. Persist to Firestore workspaces/{wsId}
      const wsSnap = await safeGetDoc('workspaces', activeWorkspace.id);
      const wsData = wsSnap?.data() || {};
      if (Array.isArray(wsData.members) || Array.isArray(activeWorkspace.members)) {
        const currentList: any[] = Array.isArray(wsData.members)
          ? wsData.members
          : Array.isArray(activeWorkspace.members)
          ? activeWorkspace.members
          : [];
        const updatedList = currentList.filter((m: any) => m.uid !== revokeConfirmMember.uid);
        await safeUpdateDoc('workspaces', activeWorkspace.id, { members: updatedList });
      } else {
        const currentMap = { ...(wsData.members || {}) };
        delete currentMap[revokeConfirmMember.uid];
        await safeUpdateDoc('workspaces', activeWorkspace.id, { members: currentMap });
      }

      // C. Remove workspace_members doc
      try {
        const wmDocId = `wm_${activeWorkspace.id}_${revokeConfirmMember.uid}`;
        await safeDeleteDoc('workspace_members', wmDocId);
      } catch (e) {}

      // D. Record audit log
      await recordAuditLog({
        document_id: revokeConfirmMember.uid,
        entity_type: 'user',
        entity_title: revokeConfirmMember.name || revokeConfirmMember.email,
        action: 'delete',
        user: currentUser,
        details: `Revoked workspace membership for ${revokeConfirmMember.name} (${revokeConfirmMember.email}) from ${activeWorkspace.name}`
      });

      triggerToast?.(`Revoked workspace access for ${revokeConfirmMember.name}`, 'success');
      setRevokeConfirmMember(null);
    } catch (err: any) {
      console.error('Failed to revoke member:', err);
      triggerToast?.('Failed to revoke member: ' + (err?.message || err), 'error');
    } finally {
      setIsRevoking(false);
    }
  };

  // 3. Inline Invite & Join Code Generator
  const handleGenerateInvite = async () => {
    if (!activeWorkspace?.id) return;
    setIsGeneratingInvite(true);

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let codeSegment = '';
    for (let i = 0; i < 6; i++) {
      codeSegment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const fullCode = `OMNI-INV-${codeSegment}`;

    try {
      const newInviteData: Omit<Invite, 'id'> = {
        code: fullCode,
        role: newInviteRole as any,
        workspaceId: activeWorkspace.id,
        workspace_id: activeWorkspace.id,
        workspaceName: activeWorkspace.name || 'Workspace',
        used: false,
        createdBy: currentUser.uid,
        createdAt: new Date().toISOString()
      };

      const res = await safeAddDoc('invites', newInviteData);
      const newId = res?.id || 'inv_' + Date.now();
      const createdInvite: Invite = { id: newId, ...newInviteData };

      if (setInvites) {
        setInvites((prev) => [createdInvite, ...prev.filter((i) => i.id !== newId)]);
      }

      setRecentlyGeneratedInvite(createdInvite);
      triggerToast?.(`Generated invitation code ${fullCode} for role ${newInviteRole}`, 'success');
    } catch (err: any) {
      console.error('Failed to generate invite:', err);
      triggerToast?.('Failed to create invite code: ' + (err?.message || err), 'error');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string, code: string) => {
    try {
      await safeDeleteDoc('invites', inviteId);
      if (setInvites) {
        setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      }
      triggerToast?.(`Revoked invitation code ${code}`, 'info');
    } catch (err: any) {
      triggerToast?.('Failed to revoke invite: ' + (err?.message || err), 'error');
    }
  };

  // Role pill styling
  const getRoleBadge = (role: WorkspaceRole) => {
    switch (role) {
      case 'Admin':
        return 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20';
      case 'Member':
        return 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20';
      case 'Viewer':
        return 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-400/20';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div id="unified-team-access-hub" className="space-y-6">
      {/* Top Banner & Control Area */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 font-sans tracking-tight">
                  Team & Access Management
                </h2>
                <span className="px-2 py-0.5 text-2xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                  {activeWorkspace?.name || 'Workspace'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Manage team members, configure 3-tier access permissions, link salesperson profiles, and issue join codes.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Join Code Quick Chip */}
          <div className="flex items-center bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-xl text-xs font-sans">
            <span className="text-slate-500 mr-1.5 font-medium">Join Code:</span>
            <span className="font-mono font-bold text-slate-800 tracking-wider mr-2">{activeJoinCode}</span>
            <button
              onClick={() => handleCopy(activeJoinCode, 'code')}
              title="Copy Join Code"
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-white rounded transition cursor-pointer"
            >
              {copiedCode === activeJoinCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Prominent "+ Invite Teammate" Launcher */}
          <button
            onClick={() => {
              setRecentlyGeneratedInvite(null);
              setIsInviteModalOpen(true);
            }}
            id="btn-invite-teammate"
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Invite Teammate</span>
          </button>
        </div>
      </div>

      {/* Filter and Metrics Strip */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 p-3 rounded-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search team member by name, email, UID, or linked rep..."
            className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-500 font-sans font-medium flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-slate-400" /> Role:
          </span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="ALL">All Roles ({teamMembers.length})</option>
            <option value="Admin">Admins ({teamMembers.filter((m) => m.role === 'Admin').length})</option>
            <option value="Member">Members ({teamMembers.filter((m) => m.role === 'Member').length})</option>
            <option value="Viewer">Viewers ({teamMembers.filter((m) => m.role === 'Viewer').length})</option>
          </select>
        </div>
      </div>

      {/* Unified Team & Access Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-2xs font-bold text-slate-500 uppercase tracking-wider font-sans">
                <th className="py-3.5 px-4">Member Identity</th>
                <th className="py-3.5 px-4">Linked Sales Rep Profile</th>
                <th className="py-3.5 px-4">3-Tier Access Role</th>
                <th className="py-3.5 px-4">Active Deals</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-sans">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No workspace members found</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {searchQuery ? 'Try adjusting your search query' : 'Use the "+ Invite Teammate" button to add members'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const activeRecords = getActiveRecordsForMember(member);
                  const count = activeRecords.length;
                  const isUpdatingRole = updatingRoleUid === member.uid;
                  const isUpdatingSalesperson = updatingSalespersonUid === member.uid;

                  return (
                    <tr
                      key={member.uid}
                      className={`hover:bg-slate-50/60 transition-colors ${
                        member.isCurrentUser ? 'bg-blue-50/20' : ''
                      }`}
                    >
                      {/* 1. Member Identity */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                            {getInitials(member.name || member.email)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-900 truncate max-w-[180px]">
                                {member.name}
                              </span>
                              {member.isOwner && (
                                <span
                                  title="Workspace Owner: Immutable permissions"
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-2xs font-bold shrink-0"
                                >
                                  <Crown className="w-2.5 h-2.5 text-amber-600" />
                                  Owner
                                </span>
                              )}
                              {member.isCurrentUser && (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md text-2xs font-bold shrink-0">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-2xs text-slate-400 font-mono truncate max-w-[200px]">
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Linked Salesperson Profile */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="relative flex-1 min-w-[160px] max-w-[220px]">
                            <select
                              value={member.salesperson_id || ''}
                              disabled={isUpdatingSalesperson}
                              onChange={(e) => handleLinkSalesperson(member, e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 font-medium focus:outline-none focus:border-blue-500 disabled:opacity-50 cursor-pointer"
                            >
                              <option value="">— Unlinked / Direct User —</option>
                              {salespersons.map((sp) => (
                                <option key={sp.id} value={sp.id}>
                                  {sp.full_name} ({sp.initials || sp.role || 'Sales Rep'})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </td>

                      {/* 3. 3-Tier Access Role Selector */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          {member.isOwner ? (
                            <div
                              title="Workspace Owner: Use Handover Wizard to transfer ownership"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold"
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
                              <span>Admin (Owner)</span>
                            </div>
                          ) : member.isCurrentUser ? (
                            <div
                              title="Self-Demotion Guard: You cannot change your own role"
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold ${getRoleBadge(
                                member.role
                              )}`}
                            >
                              <Shield className="w-3.5 h-3.5" />
                              <span>{member.role}</span>
                              <span className="text-2xs opacity-75 font-normal ml-0.5">(Protected)</span>
                            </div>
                          ) : (
                            <div className="relative">
                              <select
                                value={member.role}
                                disabled={isUpdatingRole}
                                onChange={(e) => handleRoleChange(member, e.target.value as WorkspaceRole)}
                                className={`px-3 py-1.5 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50 ${getRoleBadge(
                                  member.role
                                )}`}
                              >
                                <option value="Admin">Admin (Full Control)</option>
                                <option value="Member">Member (Operations)</option>
                                <option value="Viewer">Viewer (Read-Only)</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 4. Active Records Pill */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center">
                          {count > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-2xs font-semibold">
                              <Briefcase className="w-3 h-3 text-emerald-600" />
                              <span>{count} open deal{count === 1 ? '' : 's'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-full text-2xs font-medium">
                              <span>0 active deals</span>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Reassign Deals Button */}
                          <button
                            onClick={() => {
                              setReassignModalMember(member);
                              const otherMembers = teamMembers.filter((m) => m.uid !== member.uid);
                              setSelectedTargetUid(otherMembers[0]?.uid || '');
                            }}
                            title="Reassign deals to another team member"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-200 hover:border-blue-200 transition cursor-pointer"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>Reassign</span>
                          </button>

                          {/* Revoke Access Button */}
                          {!member.isOwner && !member.isCurrentUser ? (
                            <button
                              onClick={() => setRevokeConfirmMember(member)}
                              title="Revoke workspace membership"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-white hover:bg-rose-600 rounded-xl border border-rose-200 hover:border-rose-600 transition cursor-pointer"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                              <span>Revoke</span>
                            </button>
                          ) : member.isOwner && onOpenHandoverWizard ? (
                            <button
                              onClick={onOpenHandoverWizard}
                              title="Handover workspace ownership wizard"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-2xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 transition cursor-pointer"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Handover</span>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Inline Invite & Join Code Launcher */}
      <AnimatePresence>
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">
                      Invite Teammates to {activeWorkspace?.name || 'Workspace'}
                    </h3>
                    <p className="text-xs text-slate-500 font-sans">
                      Share the 6-character Join Code or create a role-assigned invite code.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsInviteModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Sub-tabs */}
              <div className="flex border-b border-slate-200 px-5 pt-3 bg-slate-50/50 gap-4 text-xs font-bold font-sans">
                <button
                  onClick={() => setInviteModalTab('join_code')}
                  className={`pb-2.5 border-b-2 transition cursor-pointer ${
                    inviteModalTab === 'join_code'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Option A: 6-Character Join Code
                </button>
                <button
                  onClick={() => setInviteModalTab('create_invite')}
                  className={`pb-2.5 border-b-2 transition cursor-pointer ${
                    inviteModalTab === 'create_invite'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Option B: Role-Based Invitation
                </button>
                <button
                  onClick={() => setInviteModalTab('pending_invites')}
                  className={`pb-2.5 border-b-2 transition cursor-pointer ${
                    inviteModalTab === 'pending_invites'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Active Invites ({workspaceInvites.length})
                </button>
              </div>

              {/* Tab Contents */}
              <div className="p-5 overflow-y-auto space-y-4">
                {inviteModalTab === 'join_code' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
                      <span className="text-2xs uppercase tracking-widest font-bold text-blue-700">
                        Workspace Join Code
                      </span>
                      <div className="text-3xl font-mono font-extrabold tracking-widest text-slate-900 bg-white px-6 py-2.5 rounded-xl border border-blue-200 shadow-xs">
                        {activeJoinCode}
                      </div>
                      <p className="text-xs text-slate-600 max-w-sm">
                        Teammates can switch to or join this workspace by clicking <strong>"Manage Workspaces"</strong> and entering this 6-character code.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          onClick={() => handleCopy(activeJoinCode, 'code')}
                          className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                        >
                          {copiedCode === activeJoinCode ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Copied Code!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy 6-Char Code</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleCopy(`${window.location.origin}?join=${activeJoinCode}`, 'link')}
                          className="flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold border border-slate-300 shadow-xs transition cursor-pointer"
                        >
                          {copiedLink ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Copied Direct Link!</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3.5 h-3.5" />
                              <span>Copy Direct Join URL</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {inviteModalTab === 'create_invite' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 font-sans">Assign Workspace Role</label>
                      <div className="grid grid-cols-3 gap-2.5">
                        {(['Admin', 'Member', 'Viewer'] as WorkspaceRole[]).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setNewInviteRole(r)}
                            className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                              newInviteRole === r
                                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 text-blue-900'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                            }`}
                          >
                            <div className="font-bold text-xs">{r}</div>
                            <div className="text-2xs text-slate-500 mt-0.5">
                              {r === 'Admin'
                                ? 'Full control & configuration'
                                : r === 'Member'
                                ? 'Enquiry & log operations'
                                : 'Read-only viewing'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 font-sans">Recipient or Reference Note (Optional)</label>
                      <input
                        type="text"
                        value={newInviteNote}
                        onChange={(e) => setNewInviteNote(e.target.value)}
                        placeholder="e.g., Regional Sales Rep or john@company.com"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
                      />
                    </div>

                    <button
                      onClick={handleGenerateInvite}
                      disabled={isGeneratingInvite}
                      className="w-full flex items-center justify-center space-x-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{isGeneratingInvite ? 'Generating Invite...' : `Create ${newInviteRole} Invite Code`}</span>
                    </button>

                    {recentlyGeneratedInvite && (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            Invitation Ready
                          </span>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-2xs font-bold uppercase">
                            {recentlyGeneratedInvite.role}
                          </span>
                        </div>
                        <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-emerald-200 font-mono text-xs font-bold text-slate-900">
                          <span>{recentlyGeneratedInvite.code}</span>
                          <button
                            onClick={() => handleCopy(recentlyGeneratedInvite.code, 'code')}
                            className="text-xs text-emerald-700 hover:text-emerald-900 font-sans font-semibold underline cursor-pointer"
                          >
                            {copiedCode === recentlyGeneratedInvite.code ? 'Copied!' : 'Copy Code'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {inviteModalTab === 'pending_invites' && (
                  <div className="space-y-3">
                    {workspaceInvites.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-xs font-sans">
                        No pending invite codes generated for this workspace yet.
                      </div>
                    ) : (
                      workspaceInvites.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                        >
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-slate-900">{inv.code}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-2xs font-bold uppercase ${getRoleBadge(
                                  inv.role as WorkspaceRole
                                )}`}
                              >
                                {inv.role}
                              </span>
                            </div>
                            <div className="text-2xs text-slate-400 mt-0.5">
                              Created {new Date(inv.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleCopy(inv.code, 'code')}
                              title="Copy Code"
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white rounded-lg transition cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRevokeInvite(inv.id, inv.code)}
                              title="Revoke Code"
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-white rounded-lg transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
                <button
                  onClick={() => setIsInviteModalOpen(false)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Reassign Deals Flow */}
      <AnimatePresence>
        {reassignModalMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col"
            >
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans tracking-tight">
                      Reassign Commercial Deals
                    </h3>
                    <p className="text-xs text-slate-500 font-sans">
                      Transfer active enquiries from {reassignModalMember.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setReassignModalMember(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 font-sans text-xs">
                {/* Notice */}
                <div className="p-3.5 bg-amber-50 border border-amber-200/80 rounded-xl flex items-start space-x-3 text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold">
                      {getActiveRecordsForMember(reassignModalMember).length} Active Deal(s) Found
                    </div>
                    <div className="text-2xs text-amber-700 mt-0.5">
                      Select a teammate to take over all open enquiries currently assigned to or handled by {reassignModalMember.name}.
                    </div>
                  </div>
                </div>

                {/* Target Selection */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700">Assign Deals To:</label>
                  <select
                    value={selectedTargetUid}
                    onChange={(e) => setSelectedTargetUid(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {teamMembers
                      .filter((m) => m.uid !== reassignModalMember.uid)
                      .map((m) => (
                        <option key={m.uid} value={m.uid}>
                          {m.name} ({m.role}) — {m.email}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  onClick={() => setReassignModalMember(null)}
                  disabled={isReassigning}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteReassignment}
                  disabled={isReassigning || !selectedTargetUid}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  {isReassigning ? 'Transferring Deals...' : 'Confirm Deal Transfer'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Revoke Access Confirmation */}
      <AnimatePresence>
        {revokeConfirmMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.16 }}
              className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col"
            >
              <div className="px-5 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                    <UserMinus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-rose-950 font-sans tracking-tight">
                      Revoke Workspace Access
                    </h3>
                    <p className="text-xs text-rose-600 font-sans">
                      Remove member from {activeWorkspace?.name || 'Workspace'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setRevokeConfirmMember(null)}
                  className="p-1.5 text-rose-400 hover:text-rose-700 rounded-xl transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3 font-sans text-xs text-slate-600">
                <p>
                  Are you sure you want to revoke workspace access for{' '}
                  <strong className="text-slate-900 font-bold">{revokeConfirmMember.name}</strong> ({revokeConfirmMember.email})?
                </p>
                {getActiveRecordsForMember(revokeConfirmMember).length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Active Deals Notice
                    </div>
                    <div className="text-2xs">
                      This user currently has {getActiveRecordsForMember(revokeConfirmMember).length} open deals attributed to them. You may want to click <strong>"Reassign"</strong> to transfer these deals first.
                    </div>
                  </div>
                )}
                <p className="text-2xs text-slate-400">
                  This action removes their permissions for this workspace. They can re-join in the future using an invite or join code.
                </p>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  onClick={() => setRevokeConfirmMember(null)}
                  disabled={isRevoking}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteRevoke}
                  disabled={isRevoking}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  {isRevoking ? 'Revoking Access...' : 'Confirm Revoke Access'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
