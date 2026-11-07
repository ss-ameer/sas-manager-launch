import React, { useState } from 'react';
import { Salesperson, Enquiry, Company, getInitials, Workspace, UserProfile, CallLogEntry, resolveSalespersonIdentifier, resolveSalespersonName } from '../types';
import { safeAddDoc, safeUpdateDoc, safeDeleteDoc, db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { recordAuditLog } from '../utils/auditLogger';
import ReassignOpenRecordsModal, { TargetTeamMember } from './ReassignOpenRecordsModal';
import {
  Users,
  Users2,
  TrendingUp,
  DollarSign,
  Award,
  AlertTriangle,
  Briefcase,
  Layers,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  Plus,
  Edit2,
  Trash2,
  X,
  Search,
  Mail,
  Phone,
  UserPlus,
  CheckCircle2,
  Lock,
  RefreshCw
} from 'lucide-react';
import HoverScrollText from './common/HoverScrollText';
import { FieldLabel } from './common/FieldHelpHint';
import { PageHeader, PageBody } from './layout/UiContainer';
import { isSuperAdmin, isAdmin, canAccessEnquiry, isRecordOwner, getUserWorkspaceRole } from '../utils/permissions';
import { isWonStatus, isLostOrCancelledStatus } from '../services/inventoryService';

interface SalespersonProfilesProps {
  key?: any;
  salespersons: Salesperson[];
  enquiries: Enquiry[];
  companies: Company[];
  onSelectEnquiry: (id: string) => void;
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  callLogs?: CallLogEntry[];
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  activeWorkspace?: Workspace;
  currentUser?: UserProfile;
  onOpenMobileMenu?: () => void;
  onDeduplicateSalespersons?: () => Promise<number> | void;
}

export default function SalespersonProfiles({
  salespersons,
  enquiries,
  companies,
  onSelectEnquiry,
  setSalespersons,
  setEnquiries,
  callLogs = [],
  setCallLogs,
  activeWorkspace,
  currentUser,
  onOpenMobileMenu,
  onDeduplicateSalespersons
}: SalespersonProfilesProps) {
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string | null>(salespersons[0]?.id || salespersons[0]?.initials || null);
  const [enquirySearchQuery, setEnquirySearchQuery] = useState('');
  const [enquiryStatusFilter, setEnquiryStatusFilter] = useState<'ALL' | 'ACTIVE' | 'WON' | 'LOST'>('ALL');
  const [enquirySortBy, setEnquirySortBy] = useState<'newest' | 'highest_value' | 'updated'>('newest');
  const [isDeduplicating, setIsDeduplicating] = useState(false);

  // Pagination states for linked enquiries table
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedSalespersonId, enquirySearchQuery, enquiryStatusFilter, enquirySortBy, pageSize]);

  // Form states
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingSalesperson, setEditingSalesperson] = useState<Salesperson | null>(null);
  const [formInitials, setFormInitials] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirmation state
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

  const companyMap = React.useMemo(() => {
    return new Map(companies.map((c) => [c.id, c.display_name]));
  }, [companies]);

  // Deduplicated Team Roster by ID / Email / Initials / Name
  const deduplicatedSalespersons = React.useMemo(() => {
    const seenKeys = new Set<string>();
    const list: Salesperson[] = [];
    for (const sp of salespersons) {
      const key = sp.id || (sp.email ? sp.email.toLowerCase() : '') || (sp.initials ? sp.initials.toUpperCase() : '') || sp.full_name?.toLowerCase();
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        list.push(sp);
      }
    }
    return list;
  }, [salespersons]);

  // Check if current user is listed on team roster
  const currentUserInRoster = React.useMemo(() => {
    if (!currentUser) return null;
    return salespersons.find(
      (s) =>
        (currentUser.initials && s.initials?.toUpperCase() === currentUser.initials.toUpperCase()) ||
        (currentUser.email && s.email?.toLowerCase() === currentUser.email.toLowerCase()) ||
        (currentUser.full_name && s.full_name.toLowerCase() === currentUser.full_name.toLowerCase())
    );
  }, [salespersons, currentUser]);

  const handleAddMyselfToRoster = async () => {
    if (!currentUser) return;
    const name = currentUser.full_name || currentUser.username || 'Current User';
    const initials = currentUser.initials || getInitials(name);
    const email = currentUser.email || '';
    const role = 'Sales Representative';

    if (!activeWorkspace?.id) {
      setIsSubmitting(false);
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    setIsSubmitting(true);
    try {
      const data: Omit<Salesperson, 'id'> = {
        workspace_id: activeWorkspace.id,
        initials: initials.toUpperCase(),
        full_name: name,
        role: role,
        email: email || undefined,
      };

      const res = await safeAddDoc('salespersons', data);
      const newId = res?.id || ('sp_' + Date.now());
      const newSp: Salesperson = { id: newId, ...data };

      if (setSalespersons) {
        setSalespersons((prev) => [newSp, ...prev.filter((s) => s.id !== newId)]);
      }
      setSelectedSalespersonId(newId);

      if (currentUser) {
        try {
          await recordAuditLog({
            document_id: newId,
            entity_type: 'salesperson',
            entity_title: name,
            action: 'create',
            user: currentUser,
            details: `Added self (${name}, ${initials}) to team roster`
          });
        } catch (e) {}
      }
    } catch (err: any) {
      alert('Failed to add yourself to roster: ' + (err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find metrics for a specific salesperson
  const getSalespersonMetrics = (sp: Salesperson) => {
    const personalEnqs = enquiries.filter((e) => {
      if (e.is_deleted || e.is_gap_placeholder) return false;
      const spId = resolveSalespersonIdentifier(e);
      const spName = resolveSalespersonName(e);
      const spInitUpper = (sp.initials || '').trim().toUpperCase();
      return (
        (spId && (spId === sp.id || (spInitUpper && spId.toUpperCase() === spInitUpper))) ||
        (spName && (spName === sp.id || (spInitUpper && spName.toUpperCase() === spInitUpper) || (sp.full_name && spName.toLowerCase() === sp.full_name.toLowerCase()))) ||
        e.sales_person === sp.id ||
        (spInitUpper && (e.sales_person || '').trim().toUpperCase() === spInitUpper) ||
        (e.salesperson_id && e.salesperson_id === sp.id) ||
        (e.sales_person_id && e.sales_person_id === sp.id)
      );
    });
    const activeEnqs = personalEnqs.filter(
      (e) => !isWonStatus(e.status) && !isLostOrCancelledStatus(e.status) && e.status !== 'Dead'
    );
    const activeVal = activeEnqs.reduce((sum, e) => sum + (Number(e.value_aed) || 0), 0);

    const wonEnqs = personalEnqs.filter((e) => isWonStatus(e.status));
    const wonVal = wonEnqs.reduce((sum, e) => sum + (Number(e.value_aed) || 0), 0);

    const totalClosed = personalEnqs.filter((e) => isWonStatus(e.status) || isLostOrCancelledStatus(e.status));
    const wonCount = wonEnqs.length;
    const winRate = totalClosed.length > 0 ? Math.round((wonCount / totalClosed.length) * 100) : 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const overdueCount = personalEnqs.filter(
      (e) => !isWonStatus(e.status) && !isLostOrCancelledStatus(e.status) && e.next_followup_date && e.next_followup_date < todayStr
    ).length;

    return {
      totalCount: personalEnqs.length,
      activeCount: activeEnqs.length,
      wonCount,
      closedCount: totalClosed.length,
      activeVal,
      wonVal,
      winRate,
      overdueCount,
      enquiries: personalEnqs
    };
  };

  const selectedSalesperson = salespersons.find((s) => s.id === selectedSalespersonId || s.initials === selectedSalespersonId);
  const metrics = selectedSalesperson ? getSalespersonMetrics(selectedSalesperson) : null;

  const activeWorkspaceRole = getUserWorkspaceRole(currentUser, activeWorkspace?.id, activeWorkspace);
  const rawUserRole = (currentUser?.role || '').toString().toLowerCase().trim();
  const rawWsRole = (activeWorkspaceRole || '').toString().toLowerCase().trim();

  const canManageTeam = Boolean(
    currentUser && (
      isSuperAdmin(currentUser) ||
      isAdmin(currentUser, activeWorkspace?.id, activeWorkspace) ||
      rawUserRole === 'admin' ||
      rawUserRole === 'superadmin' ||
      rawUserRole === 'super_admin' ||
      rawUserRole === 'super admin' ||
      rawWsRole === 'admin' ||
      rawWsRole === 'superadmin' ||
      rawWsRole === 'super_admin' ||
      rawWsRole === 'super admin'
    )
  );

  const isOwnProfile = (sp: Salesperson) => {
    if (!currentUser) return false;
    const userEmail = (currentUser.email || '').toLowerCase().trim();
    const spEmail = (sp.email || '').toLowerCase().trim();
    if (userEmail && spEmail && userEmail === spEmail) return true;

    const userInitials = (currentUser.initials || '').toUpperCase().trim();
    const spInitials = (sp.initials || '').toUpperCase().trim();
    if (userInitials && spInitials && userInitials === spInitials) return true;

    const userName = (currentUser.full_name || currentUser.name || currentUser.displayName || '').toLowerCase().trim();
    const spName = (sp.full_name || '').toLowerCase().trim();
    if (userName && spName && userName === spName) return true;

    return false;
  };

  // Only admins can delete team members; members can never delete
  const canDeleteSp = (_sp: Salesperson) => {
    return canManageTeam;
  };

  // Admins can edit any profile; members can ONLY edit their own personal profile
  const canEditSp = (sp: Salesperson) => {
    if (!currentUser) return false;
    if (canManageTeam) return true;
    return isOwnProfile(sp);
  };

  const canSeeSpFinancialMetrics = (sp: Salesperson) => {
    if (!currentUser) return false;
    if (canManageTeam) return true;
    return isOwnProfile(sp);
  };

  const canSeeSpAdvancedDetails = (sp: Salesperson) => {
    if (!currentUser) return false;
    if (canManageTeam) return true;
    if (isOwnProfile(sp)) return true;
    return currentUser.dataVisibilityTier !== 'BASIC';
  };

  // Check if a specific enquiry on another rep's profile is explicitly shared with or owned by the viewing user
  const isEnquiryExplicitlySharedOrOwnedByViewer = (enq: Enquiry): boolean => {
    if (!currentUser) return false;
    if (isRecordOwner(currentUser, enq)) return true;
    const uid = currentUser.uid || currentUser.id || '';
    const uEmail = (currentUser.email || '').toLowerCase().trim();
    const uInitials = (currentUser.initials || '').toUpperCase().trim();
    const sharedList: any[] = [
      ...(Array.isArray((enq as any).collaborators) ? (enq as any).collaborators : []),
      ...(Array.isArray((enq as any).shared_with) ? (enq as any).shared_with : []),
      ...(Array.isArray((enq as any).sharedWith) ? (enq as any).sharedWith : []),
      ...(Array.isArray((enq as any).collaborator_ids) ? (enq as any).collaborator_ids : [])
    ];
    return sharedList.some((entry) => {
      if (!entry) return false;
      if (typeof entry === 'string') {
        const norm = entry.trim();
        return (
          (uid && norm === uid) ||
          (uEmail && norm.toLowerCase() === uEmail) ||
          (uInitials && norm.toUpperCase() === uInitials)
        );
      }
      if (typeof entry === 'object') {
        const eUid = entry.uid || entry.id || entry.user_id || '';
        const eEmail = (entry.email || '').toLowerCase().trim();
        const eInit = (entry.initials || '').toUpperCase().trim();
        return (
          (uid && eUid === uid) ||
          (uEmail && eEmail === uEmail) ||
          (uInitials && eInit === uInitials)
        );
      }
      return false;
    });
  };

  // Format currency in AED by default
  const formatCurrency = (val: number) => {
    return `AED ${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // CRUD actions
  const openAddModal = () => {
    setEditingSalesperson(null);
    setFormInitials('');
    setFormFullName('');
    setFormRole('');
    setFormEmail('');
    setFormPhone('');
    setShowFormModal(true);
  };

  const openEditModal = (s: Salesperson) => {
    setEditingSalesperson(s);
    setFormInitials(s.initials || '');
    setFormFullName(s.full_name);
    setFormRole(s.role);
    setFormEmail(s.email || '');
    setFormPhone(s.phone || '');
    setShowFormModal(true);
  };

  const handleSaveSalesperson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFullName || !formRole) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    // If non-admin is editing their own profile, keep original initials & email locked for security
    const isLockedForNonAdmin = Boolean(editingSalesperson && !canManageTeam && isOwnProfile(editingSalesperson));

    const finalInitials = isLockedForNonAdmin && editingSalesperson
      ? editingSalesperson.initials
      : formInitials.trim() ? formInitials.trim().toUpperCase() : getInitials(formFullName);

    const finalEmail = isLockedForNonAdmin && editingSalesperson
      ? (editingSalesperson.email || undefined)
      : formEmail.trim() || undefined;

    const upperInitials = finalInitials;

    // Check duplicate initials
    const duplicate = salespersons.find(s => 
      s.initials?.toUpperCase() === upperInitials && 
      (!editingSalesperson || s.id !== editingSalesperson.id)
    );
    if (duplicate) {
      alert(`Initials "${upperInitials}" are already taken by ${duplicate.full_name}.`);
      setIsSubmitting(false);
      return;
    }

    if (!activeWorkspace?.id) {
      setIsSubmitting(false);
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    const data: Omit<Salesperson, 'id'> = {
      workspace_id: activeWorkspace.id,
      initials: upperInitials,
      full_name: formFullName.trim(),
      role: formRole.trim(),
      email: finalEmail,
      phone: formPhone.trim() || undefined,
    };

    try {
      if (editingSalesperson) {
        if (editingSalesperson.id) {
          const oldInitials = editingSalesperson.initials;
          const hasInitialsChanged = oldInitials !== upperInitials;
          const updatedSp: Salesperson = { ...editingSalesperson, ...data };

          // Update the salesperson record
          await safeUpdateDoc('salespersons', editingSalesperson.id, data);

          if (setSalespersons) {
            setSalespersons((prev) => prev.map((s) => (s.id === editingSalesperson.id ? updatedSp : s)));
          }

          // If initials changed, run a batch migration of linked enquiries
          if (hasInitialsChanged) {
            const batch = writeBatch(db);
            const linkedEnqs = enquiries.filter(
              eq => eq.sales_person === oldInitials || eq.sales_person === editingSalesperson.id
            );

            if (linkedEnqs.length > 0) {
              linkedEnqs.forEach(eq => {
                if (eq.id) {
                  const enqRef = doc(db, 'enquiries', eq.id);
                  batch.update(enqRef, { sales_person: upperInitials });
                }
              });
              await batch.commit();
            }

            if (setEnquiries) {
              setEnquiries((prev) =>
                prev.map((eq) =>
                  eq.sales_person === oldInitials || eq.sales_person === editingSalesperson.id
                    ? { ...eq, sales_person: upperInitials }
                    : eq
                )
              );
            }

            setSelectedSalespersonId(upperInitials);
          }
        }
      } else {
        const res = await safeAddDoc('salespersons', data);
        const newId = res?.id || ('sp_' + Date.now());
        const newSp: Salesperson = { id: newId, ...data };
        if (setSalespersons) {
          setSalespersons((prev) => [newSp, ...prev.filter((s) => s.id !== newId)]);
        }
        setSelectedSalespersonId(newId);
      }
      setShowFormModal(false);
    } catch (err: any) {
      alert('Failed to save salesperson: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reassign Modal State
  const [reassignModalState, setReassignModalState] = useState<{
    isOpen: boolean;
    salespersonToDelete: Salesperson | null;
    openEnquiryCount: number;
    pendingActivityCount: number;
    openEnquiries: Enquiry[];
    pendingLogs: CallLogEntry[];
  }>({
    isOpen: false,
    salespersonToDelete: null,
    openEnquiryCount: 0,
    pendingActivityCount: 0,
    openEnquiries: [],
    pendingLogs: [],
  });
  const [isReassignSubmitting, setIsReassignSubmitting] = useState(false);

  const performActualSalespersonDelete = async (spToDelete: Salesperson) => {
    const targetId = spToDelete.id || (spToDelete as any)._id;
    if (!targetId) return;

    if (setSalespersons) {
      setSalespersons((prev) => prev.filter((sp) => sp.id !== targetId));
    }
    if (selectedSalespersonId === targetId || selectedSalespersonId === spToDelete.initials) {
      const nextSp = salespersons.find(x => x.id !== targetId && x.initials !== targetId);
      setSelectedSalespersonId(nextSp ? (nextSp.id || nextSp.initials || null) : null);
    }

    await safeDeleteDoc('salespersons', targetId);
    if (currentUser) {
      try {
        await recordAuditLog({
          document_id: targetId,
          entity_type: 'salesperson',
          entity_title: spToDelete.full_name,
          action: 'delete',
          user: currentUser,
          before: spToDelete,
          details: `Removed sales representative ${spToDelete.full_name} (${spToDelete.initials})`
        });
      } catch (e) {}
    }
  };

  const handleReassignAndDeleteSalesperson = async (reassignToSalespersonId: string) => {
    const sp = reassignModalState.salespersonToDelete;
    if (!sp) return;

    const targetSp = salespersons.find(s => s.id === reassignToSalespersonId || s.initials === reassignToSalespersonId);
    const targetInitials = targetSp?.initials || (targetSp ? getInitials(targetSp.full_name) : 'UN');
    const targetId = targetSp?.id || reassignToSalespersonId;
    const targetName = targetSp?.full_name || 'Team Member';

    setIsReassignSubmitting(true);
    try {
      // 1. Reassign open enquiries
      const openEnqIds = new Set(reassignModalState.openEnquiries.map(e => e.id).filter(Boolean));
      for (const eq of reassignModalState.openEnquiries) {
        if (eq.id) {
          await safeUpdateDoc('enquiries', eq.id, {
            sales_person: targetInitials,
            salesperson: targetInitials,
            sales_person_id: targetId,
            salesperson_id: targetId,
            assigned_to: targetInitials,
            assignedSalesperson: targetInitials,
            updatedAt: new Date().toISOString()
          });
        }
      }
      if (setEnquiries) {
        setEnquiries(prev => prev.map(eq => {
          if (eq.id && openEnqIds.has(eq.id)) {
            return {
              ...eq,
              sales_person: targetInitials,
              salesperson: targetInitials,
              sales_person_id: targetId,
              salesperson_id: targetId,
              assigned_to: targetInitials,
              assignedSalesperson: targetInitials
            };
          }
          return eq;
        }));
      }

      // 2. Reassign pending call logs / activity logs
      const pendingLogIds = new Set(reassignModalState.pendingLogs.map(l => l.id).filter(Boolean));
      for (const cl of reassignModalState.pendingLogs) {
        if (cl.id) {
          await safeUpdateDoc('call_logs', cl.id, {
            sales_person: targetInitials,
            sales_person_id: targetId,
            handled_by_salesperson_id: targetId,
            handled_by_team_member_name: targetName,
            updatedAt: new Date().toISOString()
          });
        }
      }
      if (setCallLogs) {
        setCallLogs(prev => prev.map(cl => {
          if (cl.id && pendingLogIds.has(cl.id)) {
            return {
              ...cl,
              sales_person: targetInitials,
              sales_person_id: targetId,
              handled_by_salesperson_id: targetId,
              handled_by_team_member_name: targetName
            };
          }
          return cl;
        }));
      }

      // 3. Perform final deletion
      await performActualSalespersonDelete(sp);
      setReassignModalState(prev => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      alert('Failed to reassign records and delete salesperson: ' + (err?.message || err));
    } finally {
      setIsReassignSubmitting(false);
    }
  };

  const handleDirectDeleteSalesperson = async () => {
    const sp = reassignModalState.salespersonToDelete;
    if (!sp) return;

    setIsReassignSubmitting(true);
    try {
      // 1. Unassign open enquiries
      const openEnqIds = new Set(reassignModalState.openEnquiries.map(e => e.id).filter(Boolean));
      for (const eq of reassignModalState.openEnquiries) {
        if (eq.id) {
          await safeUpdateDoc('enquiries', eq.id, {
            sales_person: '',
            salesperson: '',
            sales_person_id: '',
            salesperson_id: '',
            assigned_to: '',
            assignedSalesperson: '',
            updatedAt: new Date().toISOString()
          });
        }
      }
      if (setEnquiries) {
        setEnquiries(prev => prev.map(eq => {
          if (eq.id && openEnqIds.has(eq.id)) {
            return {
              ...eq,
              sales_person: '',
              salesperson: '',
              sales_person_id: '',
              salesperson_id: '',
              assigned_to: '',
              assignedSalesperson: ''
            };
          }
          return eq;
        }));
      }

      // 2. Unassign pending call logs / activity logs
      const pendingLogIds = new Set(reassignModalState.pendingLogs.map(l => l.id).filter(Boolean));
      for (const cl of reassignModalState.pendingLogs) {
        if (cl.id) {
          await safeUpdateDoc('call_logs', cl.id, {
            sales_person: '',
            sales_person_id: '',
            handled_by_salesperson_id: '',
            handled_by_team_member_name: '',
            updatedAt: new Date().toISOString()
          });
        }
      }
      if (setCallLogs) {
        setCallLogs(prev => prev.map(cl => {
          if (cl.id && pendingLogIds.has(cl.id)) {
            return {
              ...cl,
              sales_person: '',
              sales_person_id: '',
              handled_by_salesperson_id: '',
              handled_by_team_member_name: ''
            };
          }
          return cl;
        }));
      }

      // 3. Perform final deletion
      await performActualSalespersonDelete(sp);
      setReassignModalState(prev => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      alert('Failed to unassign records and delete salesperson: ' + (err?.message || err));
    } finally {
      setIsReassignSubmitting(false);
    }
  };

  const handleDeleteSalesperson = async (s: Salesperson) => {
    const targetId = s.id || (s as any)._id;
    if (!targetId) {
      alert('Error: Salesperson ID is missing. Cannot delete.');
      return;
    }
    
    // Check open enquiries (status === 'Active') and pending activity logs assigned to this salesperson
    const openEnquiries = enquiries.filter((e) => {
      const spId = resolveSalespersonIdentifier(e);
      const spName = resolveSalespersonName(e);
      const isMatch =
        (spId && (spId === targetId || (s.initials && spId.toUpperCase() === s.initials.toUpperCase()))) ||
        (spName && (spName === targetId || (s.initials && spName.toUpperCase() === s.initials.toUpperCase()) || (s.full_name && spName.toLowerCase() === s.full_name.toLowerCase()))) ||
        e.sales_person === targetId ||
        (s.initials && e.sales_person?.toUpperCase() === s.initials.toUpperCase()) ||
        (e as any).sales_person_id === targetId;
      return (e.status === 'Active' || !e.status) && isMatch;
    });

    const pendingLogs = (callLogs || []).filter(
      (c) =>
        (['Scheduled', 'Scheduled / Planned', 'Scheduled / Draft'].includes(c.status) ||
          c.status === 'Follow-Up Required' ||
          Boolean(c.next_followup_date)) &&
        ((c as any).sales_person_id === targetId ||
          (s.initials && c.sales_person?.toUpperCase() === s.initials.toUpperCase()) ||
          (c.sales_person && c.sales_person.toLowerCase() === s.full_name.toLowerCase()) ||
          c.handled_by_salesperson_id === targetId)
    );

    if (openEnquiries.length > 0 || pendingLogs.length > 0) {
      setReassignModalState({
        isOpen: true,
        salespersonToDelete: s,
        openEnquiryCount: openEnquiries.length,
        pendingActivityCount: pendingLogs.length,
        openEnquiries,
        pendingLogs,
      });
      return;
    }

    // Fallback standard delete confirm if no open records
    const message = `Are you sure you want to remove ${s.full_name}?`;

    setConfirmDialog({
      isOpen: true,
      title: 'Remove Sales Representative',
      message,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await performActualSalespersonDelete(s);
        } catch (err: any) {
          alert('Failed to delete representative: ' + err.message);
        }
      }
    });
  };

  // Filter & sort linked enquiries based on search query, status pill, and sort mode
  const filteredEnquiries = React.useMemo(() => {
    if (!metrics) return [];
    const q = enquirySearchQuery.toLowerCase().trim();
    const canSortByValue = selectedSalesperson ? canSeeSpFinancialMetrics(selectedSalesperson) : false;

    const list = metrics.enquiries.filter((e) => {
      if (enquiryStatusFilter === 'ACTIVE') {
        if (isWonStatus(e.status) || isLostOrCancelledStatus(e.status) || e.status === 'Dead') return false;
      } else if (enquiryStatusFilter === 'WON') {
        if (!isWonStatus(e.status)) return false;
      } else if (enquiryStatusFilter === 'LOST') {
        if (!isLostOrCancelledStatus(e.status) && e.status !== 'Dead') return false;
      }

      if (!q) return true;
      const compName = (companyMap.get(e.company_id) || e.company_name || '').toLowerCase();
      const ref = (e.quote_ref_no || '').toLowerCase();
      const desc = (e.description || e.project_name || '').toLowerCase();
      const snStr = String(e.sn || '');
      return compName.includes(q) || ref.includes(q) || desc.includes(q) || snStr.includes(q);
    });

    return [...list].sort((a, b) => {
      if (enquirySortBy === 'highest_value' && canSortByValue) {
        return (Number(b.value_aed) || 0) - (Number(a.value_aed) || 0);
      }
      if (enquirySortBy === 'updated') {
        const aTime = new Date((a as any).updatedAt || a.enquiry_date || 0).getTime();
        const bTime = new Date((b as any).updatedAt || b.enquiry_date || 0).getTime();
        return bTime - aTime;
      }
      return (Number(b.sn) || 0) - (Number(a.sn) || 0);
    });
  }, [metrics, enquirySearchQuery, enquiryStatusFilter, enquirySortBy, companyMap, selectedSalesperson]);

  // Paginated subset of linked enquiries
  const paginatedEnquiries = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredEnquiries.slice(startIndex, startIndex + pageSize);
  }, [filteredEnquiries, currentPage, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredEnquiries.length / pageSize));

  return (
    <>
      <PageHeader
        title="Sales Team Roster"
        subtitle="Monitor sales representative proposal pipelines, conversion rates, and team assignment rosters."
        icon={Users2}
        badge={{ text: `${deduplicatedSalespersons.length} Reps Active`, variant: 'blue' }}
        currentUser={currentUser}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={
          canManageTeam
            ? {
                label: 'Add Team Member',
                icon: Plus,
                onClick: openAddModal
              }
            : undefined
        }
      />

      <PageBody>
      <div id="sales-tab" className="text-slate-800 dark:text-slate-200 flex flex-col lg:flex-row gap-6 items-start">
      {/* Left panel: Clean Directory Roster */}
      <div className="w-full lg:w-[320px] xl:w-[340px] shrink-0 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Team Directory
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-slate-500">
              &middot; {deduplicatedSalespersons.length}
            </span>
          </div>
          {canManageTeam && onDeduplicateSalespersons && (
            <button
              type="button"
              disabled={isDeduplicating}
              onClick={async () => {
                setIsDeduplicating(true);
                try {
                  await onDeduplicateSalespersons();
                } finally {
                  setIsDeduplicating(false);
                }
              }}
              title="Merge duplicate salesperson entries by name or initials"
              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`w-3 h-3 ${isDeduplicating ? 'animate-spin text-blue-600' : 'text-slate-400'}`} />
              <span>Deduplicate</span>
            </button>
          )}
        </div>

        {/* Self-Onboarding Trigger (Only shown when current user is missing from roster) */}
        {!currentUserInRoster && currentUser && (
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/40 dark:bg-emerald-950/20">
            <button
              type="button"
              onClick={handleAddMyselfToRoster}
              disabled={isSubmitting || !activeWorkspace?.id}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Add Myself ({currentUser.full_name || currentUser.username})</span>
            </button>
          </div>
        )}

        <div className="p-2.5 space-y-1.5">
          {deduplicatedSalespersons.map((s, idx) => {
            const m = getSalespersonMetrics(s);
            const isSelected = selectedSalespersonId === s.id || selectedSalespersonId === s.initials;
            const isUserSelf = isOwnProfile(s);
            return (
              <button
                key={s.id || `${s.initials}-${s.full_name}-${idx}`}
                type="button"
                onClick={() => setSelectedSalespersonId(s.id || s.initials || null)}
                className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition duration-150 cursor-pointer focus:outline-none ${
                  isSelected
                    ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/80 text-slate-950 dark:text-white shadow-2xs'
                    : 'bg-white dark:bg-slate-900 border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:border-slate-200/80 dark:hover:border-slate-700/80 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-lg font-mono font-bold flex items-center justify-center border text-xs shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 border-blue-500 text-white shadow-2xs'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}>
                    {s.initials || getInitials(s.full_name)}
                  </div>
                  <div className="overflow-hidden min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <HoverScrollText
                        text={s.full_name}
                        className="text-sm font-semibold font-sans text-slate-900 dark:text-slate-100"
                      />
                      {isUserSelf && (
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                          &middot; You
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block truncate">
                      {s.role?.trim() || 'Sales Representative'}
                    </span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200 block">
                    {m.enquiries.length} {m.enquiries.length === 1 ? 'Enq' : 'Enqs'}
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 block">
                    {m.winRate}% Won
                  </span>
                </div>
              </button>
            );
          })}
          {deduplicatedSalespersons.length === 0 && (
            <div className="p-6 text-center bg-slate-50/50 dark:bg-slate-900/50 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">No Team Members Registered</div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Add sales representatives to attribute enquiries, quotations, and call activities.
              </p>
              {canManageTeam && (
                <button
                  type="button"
                  onClick={openAddModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Team Member</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panel: Two Clean Single-Elevation Surfaces */}
      <div className="flex-1 min-w-0 space-y-5 w-full">
        {selectedSalesperson && metrics ? (
          <>
            {/* Surface A: Executive Rep Profile & Unified KPI Strip */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
              {/* Top Row: Identity & Dedicated Actions */}
              <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/70 text-blue-600 dark:text-blue-400 font-mono text-base font-bold flex items-center justify-center rounded-xl shrink-0">
                    {selectedSalesperson.initials || getInitials(selectedSalesperson.full_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <HoverScrollText
                        as="h3"
                        text={selectedSalesperson.full_name}
                        className="text-lg font-bold text-slate-900 dark:text-white font-sans leading-snug"
                      />
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">&middot;</span>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {selectedSalesperson.role?.trim() || 'Sales Representative'}
                      </span>
                      {isOwnProfile(selectedSalesperson) && (
                        <>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">&middot;</span>
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            Your Profile
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400 font-sans">
                      {canSeeSpAdvancedDetails(selectedSalesperson) ? (
                        <>
                          {selectedSalesperson.email ? (
                            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                              <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{selectedSalesperson.email}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">No email on file</span>
                          )}
                          {selectedSalesperson.phone && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">&middot;</span>
                              <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{selectedSalesperson.phone}</span>
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <span className="text-xs font-medium text-purple-700 dark:text-purple-400">
                          Basic View Tier
                        </span>
                      )}
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">&middot;</span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {metrics.totalCount} total {metrics.totalCount === 1 ? 'proposal' : 'proposals'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Action Cluster */}
                {(canEditSp(selectedSalesperson) || canDeleteSp(selectedSalesperson)) && (
                  <div className="flex items-center gap-2 shrink-0">
                    {canEditSp(selectedSalesperson) && (
                      <button
                        type="button"
                        onClick={() => openEditModal(selectedSalesperson)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Edit Profile</span>
                      </button>
                    )}
                    {canDeleteSp(selectedSalesperson) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteSalesperson(selectedSalesperson)}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:hover:border-rose-800 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition cursor-pointer"
                        title="Remove Sales Representative"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Row: Unified 4-Column Divided KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800 bg-slate-50/40 dark:bg-slate-900/40">
                <div className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Active Pipeline</span>
                    </span>
                    {!canSeeSpFinancialMetrics(selectedSalesperson) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Confidential</span>
                      </span>
                    )}
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {canSeeSpFinancialMetrics(selectedSalesperson) ? formatCurrency(metrics.activeVal) : 'AED ••••••'}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {metrics.activeCount} active {metrics.activeCount === 1 ? 'enquiry' : 'enquiries'}
                  </div>
                </div>

                <div className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>Closed Won Value</span>
                    </span>
                    {!canSeeSpFinancialMetrics(selectedSalesperson) && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Confidential</span>
                      </span>
                    )}
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {canSeeSpFinancialMetrics(selectedSalesperson) ? formatCurrency(metrics.wonVal) : 'AED ••••••'}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {metrics.wonCount} won {metrics.wonCount === 1 ? 'order' : 'orders'}
                  </div>
                </div>

                <div className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    <Award className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span>Conversion Rate</span>
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {metrics.winRate}%
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {metrics.wonCount} won of {metrics.closedCount} closed
                  </div>
                </div>

                <div className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${metrics.overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`} />
                    <span>Follow-Up Health</span>
                  </div>
                  <div className={`text-base font-bold font-mono tabular-nums ${metrics.overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                    {metrics.overdueCount} Overdue
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {metrics.overdueCount > 0 ? 'Needs immediate follow-up' : 'All follow-ups on schedule'}
                  </div>
                </div>
              </div>
            </div>

            {/* Surface B: Standardized Linked Enquiries Table Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-clip">
              {/* Single-Row Table Toolbar */}
              <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                <div className="flex items-center flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-slate-400 shrink-0" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white font-sans">
                      Linked Enquiries
                    </h4>
                    <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      ({filteredEnquiries.length}{filteredEnquiries.length !== metrics.totalCount ? ` of ${metrics.totalCount}` : ''})
                    </span>
                  </div>

                  {/* Pipeline Status Segmented Controls */}
                  <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/80 dark:border-slate-700">
                    {(
                      [
                        { id: 'ALL', label: 'All' },
                        { id: 'ACTIVE', label: 'Active' },
                        { id: 'WON', label: 'Won' },
                        { id: 'LOST', label: 'Lost' }
                      ] as const
                    ).map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => setEnquiryStatusFilter(pill.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                          enquiryStatusFilter === pill.id
                            ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sort & Search Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <select
                    value={enquirySortBy}
                    onChange={(e) => setEnquirySortBy(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                    title="Sort Linked Enquiries"
                  >
                    <option value="newest">Sort: Newest SN</option>
                    {canSeeSpFinancialMetrics(selectedSalesperson) && (
                      <option value="highest_value">Sort: Highest Value</option>
                    )}
                    <option value="updated">Sort: Recently Updated</option>
                  </select>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter by SN, Ref, or Client..."
                      value={enquirySearchQuery}
                      onChange={(e) => setEnquirySearchQuery(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:border-blue-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
                    />
                    {enquirySearchQuery && (
                      <button
                        type="button"
                        onClick={() => setEnquirySearchQuery('')}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {paginatedEnquiries.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="table-fixed w-full text-left border-collapse min-w-[680px]">
                      <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)]">
                        <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <th className="w-[16%] py-2.5 pl-5 pr-3 whitespace-nowrap">SN / Date</th>
                          <th className="w-[36%] py-2.5 px-3 whitespace-nowrap">Client &amp; Project</th>
                          <th className="w-[22%] py-2.5 px-3 whitespace-nowrap">Quote Ref &amp; Items</th>
                          <th className="w-[18%] py-2.5 px-3 text-right whitespace-nowrap">Value &amp; Stage</th>
                          <th className="w-[84px] py-2.5 pl-3 pr-5 text-right whitespace-nowrap">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70 text-xs">
                        {paginatedEnquiries.map((e) => {
                          const canViewRepFinances = canSeeSpFinancialMetrics(selectedSalesperson);
                          const isExplicitlySharedOrOwned = isEnquiryExplicitlySharedOrOwnedByViewer(e);
                          const canViewRowAndValue =
                            canViewRepFinances ||
                            (isExplicitlySharedOrOwned && canAccessEnquiry(currentUser, e, activeWorkspace));
                          const showSharedBadge = !canViewRepFinances && canViewRowAndValue;

                          const rawDesc = (e.description || e.project_name || e.remarks || '').trim();
                          const cleanDesc = rawDesc && !/^no description$/i.test(rawDesc) ? rawDesc : '';
                          const itemCount = Array.isArray((e as any).items)
                            ? (e as any).items.length
                            : Array.isArray((e as any).line_items)
                            ? (e as any).line_items.length
                            : Number((e as any).items_count) || 0;
                          const formattedEnqDate = (() => {
                            const rawDate = e.enquiry_date || (e as any).date || (e as any).created_at;
                            if (!rawDate) return '—';
                            const d = new Date(rawDate);
                            if (isNaN(d.getTime())) return String(rawDate);
                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
                          })();

                          return (
                            <tr
                              key={e.id}
                              onClick={() => {
                                if (canViewRowAndValue && e.id) {
                                  onSelectEnquiry(e.id);
                                }
                              }}
                              className={`group transition-colors ${
                                canViewRowAndValue
                                  ? 'hover:bg-blue-50/40 dark:hover:bg-slate-800/50 cursor-pointer'
                                  : 'opacity-85 cursor-default'
                              }`}
                            >
                              {/* Col 1: SN / Date */}
                              <td className="py-3 pl-5 pr-3 align-middle">
                                <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
                                  #{e.sn}
                                </div>
                                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {formattedEnqDate}
                                </div>
                              </td>

                              {/* Col 2: Client & Project */}
                              <td className="py-3 px-3 align-middle">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {companyMap.get(e.company_id) || e.company_name || 'Client Enquiry'}
                                  </span>
                                  {showSharedBadge && (
                                    <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                                      &middot; Shared
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {cleanDesc || '—'}
                                </div>
                              </td>

                              {/* Col 3: Quote Ref & Items */}
                              <td className="py-3 px-3 align-middle">
                                <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                                  {e.quote_ref_no || `ENQ-${e.sn}`}
                                </div>
                                <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {itemCount} {itemCount === 1 ? 'line item' : 'line items'}
                                </div>
                              </td>

                              {/* Col 4: Value & Stage */}
                              <td className="py-3 px-3 align-middle text-right">
                                {canViewRowAndValue ? (
                                  <div className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
                                    {formatCurrency(Number(e.value_aed) || 0)}
                                  </div>
                                ) : (
                                  <div
                                    className="inline-flex items-center justify-end gap-1 font-mono font-semibold text-amber-700 dark:text-amber-400"
                                    title="Deal value is confidential to this representative and workspace admins"
                                  >
                                    <Lock className="w-3 h-3 shrink-0" />
                                    <span>AED ••••</span>
                                  </div>
                                )}
                                <div
                                  className={`text-[10px] font-mono font-bold uppercase tracking-wider truncate mt-0.5 ${
                                    isWonStatus(e.status)
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : isLostOrCancelledStatus(e.status)
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {e.status || 'Active'}
                                </div>
                              </td>

                              {/* Col 5: Action */}
                              <td className="py-3 pl-3 pr-5 align-middle text-right">
                                <div className="flex items-center justify-end">
                                  {canViewRowAndValue ? (
                                    <button
                                      type="button"
                                      onClick={(ev) => {
                                        ev.stopPropagation();
                                        if (e.id) onSelectEnquiry(e.id);
                                      }}
                                      className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 group-hover:border-blue-300 dark:group-hover:border-blue-700 text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition inline-flex items-center justify-center cursor-pointer"
                                      title="Open Enquiry Details"
                                    >
                                      <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                  ) : (
                                    <span
                                      className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-400 inline-flex items-center justify-center cursor-not-allowed"
                                      title="Confidential: Only the assigned representative, collaborators, or Admins can open this enquiry"
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Canonical Attached Pagination Footer */}
                  <div className="bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-200/80 dark:border-slate-800 px-5 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                      Showing <span className="font-bold tabular-nums text-slate-900 dark:text-white">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {Math.min(currentPage * pageSize, filteredEnquiries.length)}
                      </span>{' '}
                      of <span className="font-bold tabular-nums text-slate-900 dark:text-white">{filteredEnquiries.length}</span> enquiries
                    </span>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Rows:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value={10}>10</option>
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                        </select>
                      </div>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                          disabled={currentPage <= 1}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Prev</span>
                        </button>
                        <span className="text-xs font-mono px-2.5 text-slate-600 dark:text-slate-400">
                          Page <span className="font-bold tabular-nums text-slate-900 dark:text-white">{currentPage}</span> of{' '}
                          <span className="font-bold tabular-nums text-slate-900 dark:text-white">{totalPages}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                          disabled={currentPage >= totalPages}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <span>Next</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-12 px-4 text-center font-sans">
                  {enquirySearchQuery.trim() || enquiryStatusFilter !== 'ALL' ? (
                    <div className="max-w-sm mx-auto flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <Search className="w-4 h-4" />
                      </div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        No Matching Enquiries Found
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Reset your search or status filter to view all {metrics.enquiries.length} enquiries attributed to {selectedSalesperson.full_name}.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEnquirySearchQuery('');
                          setEnquiryStatusFilter('ALL');
                        }}
                        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-bold transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reset Filters</span>
                      </button>
                    </div>
                  ) : (
                    <div className="max-w-sm mx-auto flex flex-col items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        No Linked Enquiries Yet
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Enquiries assigned to {selectedSalesperson.full_name} ({selectedSalesperson.initials}) will appear here automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center font-sans shadow-xs flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-800/70 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Select a Team Member to View Performance
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
              Choose a representative from the left roster to inspect their personal pipeline, conversion metrics, and attributed enquiries.
            </p>
            {canManageTeam && deduplicatedSalespersons.length === 0 && (
              <button
                type="button"
                onClick={openAddModal}
                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Team Member</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Salesperson Modal Form */}
      {showFormModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <form
            onSubmit={handleSaveSalesperson}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900 font-sans">
                {editingSalesperson
                  ? isOwnProfile(editingSalesperson) && !canManageTeam
                    ? 'Edit Your Profile'
                    : 'Edit Team Member Profile'
                  : 'Add New Team Member'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 font-sans">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Initials / Code (Uppercase, 2-3 Letters)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AM"
                  maxLength={4}
                  value={formInitials}
                  disabled={Boolean(editingSalesperson && !canManageTeam)}
                  readOnly={Boolean(editingSalesperson && !canManageTeam)}
                  onChange={(e) => setFormInitials(e.target.value.toUpperCase())}
                  className={`w-full rounded-xl py-2 px-3 text-sm uppercase font-mono focus:outline-none ${
                    editingSalesperson && !canManageTeam
                      ? 'bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed select-none'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 focus:border-blue-500'
                  }`}
                />
                {editingSalesperson && !canManageTeam && (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Rep attribution code is locked by Admin.</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ameer S."
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Role Description
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Sales Manager"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <FieldLabel
                  label="Email Address"
                  hint="Used to match this representative's account and automatically excluded from client contact detection during AI RFQ extraction."
                />
                <input
                  type="email"
                  placeholder="e.g. ameer@ourcompany.com"
                  value={formEmail}
                  disabled={Boolean(editingSalesperson && !canManageTeam)}
                  readOnly={Boolean(editingSalesperson && !canManageTeam)}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className={`w-full rounded-xl py-2 px-3 text-sm focus:outline-none ${
                    editingSalesperson && !canManageTeam
                      ? 'bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed select-none'
                      : 'bg-slate-50 border border-slate-200 text-slate-800 focus:border-blue-500'
                  }`}
                />
                {editingSalesperson && !canManageTeam && (
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                    <span>Linked to login authentication.</span>
                  </p>
                )}
              </div>

              <div>
                <FieldLabel
                  label="Direct Phone / Mobile"
                  hint="Representative's direct phone or mobile number — automatically excluded from client contact detection during AI RFQ extraction."
                />
                <input
                  type="text"
                  placeholder="e.g. +971 50 123 4567"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !activeWorkspace?.id}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-xl text-xs font-bold text-white transition flex items-center space-x-1.5"
              >
                {isSubmitting && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{isSubmitting ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reassign Open Records Before Deletion Modal */}
      <ReassignOpenRecordsModal
        isOpen={reassignModalState.isOpen}
        onClose={() => setReassignModalState(prev => ({ ...prev, isOpen: false }))}
        representativeName={reassignModalState.salespersonToDelete?.full_name || 'Sales Representative'}
        openEnquiryCount={reassignModalState.openEnquiryCount}
        pendingActivityCount={reassignModalState.pendingActivityCount}
        availableTeamMembers={deduplicatedSalespersons
          .filter(sp => sp.id !== reassignModalState.salespersonToDelete?.id && sp.initials !== reassignModalState.salespersonToDelete?.initials)
          .map(sp => ({
            id: sp.id || sp.initials || '',
            name: sp.full_name,
            initials: sp.initials,
            role: sp.role
          }))}
        onReassignAndDelete={handleReassignAndDeleteSalesperson}
        onDirectDelete={handleDirectDeleteSalesperson}
        isSubmitting={isReassignSubmitting}
      />

      {/* Reusable Confirmation Dialog Overlay */}
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
    </PageBody>
  </>
);
}
