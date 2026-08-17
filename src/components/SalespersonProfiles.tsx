import React, { useState } from 'react';
import { Salesperson, Enquiry, Company, getInitials, Workspace, UserProfile, CallLogEntry } from '../types';
import { safeAddDoc, safeUpdateDoc, safeDeleteDoc, db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { recordAuditLog } from '../utils/auditLogger';
import ReassignOpenRecordsModal, { TargetTeamMember } from './ReassignOpenRecordsModal';
import {
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
  CheckCircle2
} from 'lucide-react';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';

interface SalespersonProfilesProps {
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
  onOpenMobileMenu
}: SalespersonProfilesProps) {
  const [selectedSalespersonId, setSelectedSalespersonId] = useState<string | null>(salespersons[0]?.id || salespersons[0]?.initials || null);
  const [enquirySearchQuery, setEnquirySearchQuery] = useState('');

  // Pagination states for linked enquiries list
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedSalespersonId, enquirySearchQuery]);

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
    const personalEnqs = enquiries.filter((e) => e.sales_person === sp.id || e.sales_person === sp.initials);
    const activeVal = personalEnqs
      .filter((e) => e.status === 'Active')
      .reduce((sum, e) => sum + e.value_aed, 0);

    const wonVal = personalEnqs
      .filter((e) => e.status === 'Order Received')
      .reduce((sum, e) => sum + e.value_aed, 0);

    const totalClosed = personalEnqs.filter((e) => ['Order Received', 'Lost'].includes(e.status));
    const wonCount = personalEnqs.filter((e) => e.status === 'Order Received').length;
    const winRate = totalClosed.length > 0 ? Math.round((wonCount / totalClosed.length) * 100) : 0;

    const overdueCount = personalEnqs.filter(
      (e) => e.status === 'Active' && e.next_followup_date && e.next_followup_date < new Date().toISOString().split('T')[0]
    ).length;

    return {
      totalCount: personalEnqs.length,
      activeVal,
      wonVal,
      winRate,
      overdueCount,
      enquiries: personalEnqs
    };
  };

  const selectedSalesperson = salespersons.find((s) => s.id === selectedSalespersonId || s.initials === selectedSalespersonId);
  const metrics = selectedSalesperson ? getSalespersonMetrics(selectedSalesperson) : null;

  const canEditOrDeleteSp = (sp: Salesperson) => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin') return true;
    return (
      (currentUser.email && sp.email && currentUser.email.toLowerCase() === sp.email.toLowerCase()) ||
      (currentUser.initials && sp.initials && currentUser.initials.toUpperCase() === sp.initials.toUpperCase()) ||
      (currentUser.full_name && sp.full_name && currentUser.full_name.toLowerCase() === sp.full_name.toLowerCase())
    );
  };

  const canSeeSpAdvancedDetails = (sp: Salesperson) => {
    if (!currentUser) return false;
    if (currentUser.role === 'Admin') return true;
    if (canEditOrDeleteSp(sp)) return true;
    return currentUser.dataVisibilityTier !== 'BASIC';
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

    const upperInitials = formInitials.trim() ? formInitials.trim().toUpperCase() : getInitials(formFullName);

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
      email: formEmail.trim() || undefined,
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
            sales_person_id: targetId,
            updatedAt: new Date().toISOString()
          });
        }
      }
      if (setEnquiries) {
        setEnquiries(prev => prev.map(eq => {
          if (eq.id && openEnqIds.has(eq.id)) {
            return { ...eq, sales_person: targetInitials, sales_person_id: targetId };
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
            sales_person_id: '',
            updatedAt: new Date().toISOString()
          });
        }
      }
      if (setEnquiries) {
        setEnquiries(prev => prev.map(eq => {
          if (eq.id && openEnqIds.has(eq.id)) {
            return { ...eq, sales_person: '', sales_person_id: '' };
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
    const openEnquiries = enquiries.filter(
      (e) =>
        e.status === 'Active' &&
        (e.sales_person === targetId ||
          (s.initials && e.sales_person?.toUpperCase() === s.initials.toUpperCase()) ||
          (e as any).sales_person_id === targetId)
    );

    const pendingLogs = (callLogs || []).filter(
      (c) =>
        (c.status === 'Scheduled' ||
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
    let message = `Are you sure you want to remove ${s.full_name}?`;

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

  // Filter linked enquiries based on search query
  const filteredEnquiries = React.useMemo(() => {
    if (!metrics) return [];
    if (!enquirySearchQuery) return metrics.enquiries;
    const q = enquirySearchQuery.toLowerCase();
    return metrics.enquiries.filter((e) => {
      const compName = (companyMap.get(e.company_id) || '').toLowerCase();
      const ref = e.quote_ref_no.toLowerCase();
      const snStr = e.sn.toString();
      return compName.includes(q) || ref.includes(q) || snStr.includes(q);
    });
  }, [metrics, enquirySearchQuery, companyMap]);

  // Paginated subset of linked enquiries
  const paginatedEnquiries = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredEnquiries.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEnquiries, currentPage]);

  const totalPages = Math.ceil(filteredEnquiries.length / itemsPerPage);

  return (
    <>
      <PageHeader
        title="Sales Team & Performance Roster"
        subtitle="Monitor sales representative proposal pipelines, conversion rates, and team assignment rosters."
        icon={Users2}
        badge={{ text: `${deduplicatedSalespersons.length} Reps Active`, variant: 'blue' }}
        currentUser={currentUser}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={{
          label: 'Add Team Member',
          icon: Plus,
          onClick: openAddModal
        }}
      />

      <PageBody maxWidth="max-w-7xl">
      <div id="sales-tab" className="text-slate-800 flex flex-col lg:flex-row gap-8">
      {/* Left panel: List of all Salespersons */}
      <div className="w-full lg:w-1/3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm h-fit">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <Users2 className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-900 font-sans">Team Roster</h2>
          </div>
          <button
            onClick={openAddModal}
            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition cursor-pointer"
            title="Add Team Member"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Current User Roster Status Banner / Add Myself Trigger */}
        <div className="mb-4">
          {!currentUserInRoster && currentUser ? (
            <button
              type="button"
              onClick={handleAddMyselfToRoster}
              disabled={isSubmitting || !activeWorkspace?.id}
              className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Myself ({currentUser.full_name || currentUser.username}) to Team Roster</span>
            </button>
          ) : currentUserInRoster ? (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">You are on Team Roster ({currentUserInRoster.initials})</span>
              </div>
              <button
                type="button"
                onClick={() => openEditModal(currentUserInRoster)}
                className="text-emerald-700 hover:text-emerald-900 font-bold underline text-[11px] cursor-pointer"
              >
                Edit
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {deduplicatedSalespersons.map((s, idx) => {
            const m = getSalespersonMetrics(s);
            const isSelected = selectedSalespersonId === s.id || selectedSalespersonId === s.initials;
            return (
              <div
                key={s.id || `${s.initials}-${s.full_name}-${idx}`}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition duration-150 group/item ${
                  isSelected
                    ? 'bg-blue-50 border-blue-200 text-slate-950 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <button
                  onClick={() => setSelectedSalespersonId(s.id || s.initials || null)}
                  className="flex items-center space-x-3 flex-1 text-left focus:outline-none cursor-pointer"
                >
                  <div className={`w-9 h-9 rounded-lg font-mono font-bold flex items-center justify-center border text-xs shrink-0 ${
                    isSelected ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    {s.initials || getInitials(s.full_name)}
                  </div>
                  <div className="overflow-hidden">
                    <span className="text-sm font-semibold truncate block font-sans text-slate-900">{s.full_name}</span>
                    <span className="text-[10px] text-slate-400 font-mono block mt-0.5">{s.role}</span>
                  </div>
                </button>

                <div className="flex items-center space-x-3 text-right shrink-0">
                  <div className="hidden sm:block group-hover/item:hidden">
                    <span className="text-xs font-mono font-semibold text-slate-700 block">
                      {m.enquiries.length} {m.enquiries.length === 1 ? 'Job' : 'Jobs'}
                    </span>
                    <span className="text-[9px] font-mono text-emerald-600 block mt-0.5">
                      {m.winRate}% Won
                    </span>
                  </div>
                  {/* Hover action edit/delete triggers for salesperson */}
                  {canEditOrDeleteSp(s) && (
                    <div className="flex items-center space-x-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditModal(s)}
                        className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-700 transition cursor-pointer"
                        title="Edit Profile"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSalesperson(s)}
                        className="p-1 hover:bg-red-50 rounded-md text-slate-400 hover:text-red-600 transition cursor-pointer"
                        title="Delete Representative"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right panel: Specific Salesperson Profile Sheet */}
      <div className="flex-1 space-y-6">
        {selectedSalesperson && metrics ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-6">
            {/* Header Block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 bg-blue-50 border border-blue-100 text-blue-600 font-mono text-xl font-bold flex items-center justify-center rounded-2xl shadow-sm">
                  {selectedSalesperson.initials || getInitials(selectedSalesperson.full_name)}
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 font-sans">{selectedSalesperson.full_name}</h3>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs text-slate-500 font-sans">
                    <p className="font-medium text-slate-700">{selectedSalesperson.role}</p>
                    {canSeeSpAdvancedDetails(selectedSalesperson) ? (
                      <>
                        {selectedSalesperson.email && (
                          <div className="flex items-center space-x-1 text-slate-600">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{selectedSalesperson.email}</span>
                          </div>
                        )}
                        {selectedSalesperson.phone && (
                          <div className="flex items-center space-x-1 text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{selectedSalesperson.phone}</span>
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md font-medium">
                        Basic View Tier
                      </span>
                    )}
                    {canEditOrDeleteSp(selectedSalesperson) && (
                      <>
                        <button
                          onClick={() => openEditModal(selectedSalesperson)}
                          className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Profile</span>
                        </button>
                        <button
                          onClick={() => handleDeleteSalesperson(selectedSalesperson)}
                          className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center space-x-1 cursor-pointer ml-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete Rep</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-right">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Total Proposals</span>
                <span className="text-lg font-bold font-mono text-slate-800">{metrics.totalCount} enquiries</span>
              </div>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 rounded-xl p-4">
                <div className="flex items-center space-x-2.5 text-xs text-slate-500 dark:text-slate-400 mb-1 font-sans">
                  <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>Active Value</span>
                </div>
                <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 mt-1">
                  {canSeeSpAdvancedDetails(selectedSalesperson) ? formatCurrency(metrics.activeVal) : '•••••'}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 rounded-xl p-4">
                <div className="flex items-center space-x-2.5 text-xs text-slate-500 dark:text-slate-400 mb-1 font-sans">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Closed Wins</span>
                </div>
                <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 mt-1">
                  {canSeeSpAdvancedDetails(selectedSalesperson) ? formatCurrency(metrics.wonVal) : '•••••'}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 rounded-xl p-4">
                <div className="flex items-center space-x-2.5 text-xs text-slate-500 dark:text-slate-400 mb-1 font-sans">
                  <Award className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Win Rate Ratio</span>
                </div>
                <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 mt-1">
                  {metrics.winRate}%
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 rounded-xl p-4">
                <div className="flex items-center space-x-2.5 text-xs text-slate-500 dark:text-slate-400 mb-1 font-sans">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  <span>Overdue Tasks</span>
                </div>
                <div className={`text-lg font-bold font-mono mt-1 ${metrics.overdueCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}`}>
                  {metrics.overdueCount}
                </div>
              </div>
            </div>

            {/* List of their Enquiries */}
            <div className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 gap-2">
                <h4 className="text-base font-bold text-slate-900 font-sans flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <span>Linked Enquiries ({filteredEnquiries.length})</span>
                </h4>
                {/* Linked Enquiries Search Input */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter by SN, Ref or Client..."
                    value={enquirySearchQuery}
                    onChange={(e) => setEnquirySearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-700 focus:outline-none"
                  />
                  {enquirySearchQuery && (
                    <button
                      onClick={() => setEnquirySearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {paginatedEnquiries.length > 0 ? (
                <div className="space-y-3">
                  <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 scrollbar-thin">
                    {paginatedEnquiries.map((e) => (
                      <div
                        key={e.id}
                        className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl hover:border-slate-300 transition duration-100 flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono text-slate-400">#{e.sn}</span>
                            <span className="text-sm font-semibold text-slate-800 font-sans">
                              {companyMap.get(e.company_id) || 'Unknown Company'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 truncate max-w-[320px] font-sans">
                            {e.quote_ref_no} — {e.remarks || 'No notes added'}
                          </p>
                        </div>

                        <div className="flex items-center space-x-6 justify-between md:justify-end shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-mono font-semibold text-slate-800 block">
                              {formatCurrency(e.value_aed)}
                            </span>
                            <span className="text-[10px] font-mono font-bold block mt-0.5 text-slate-400 uppercase">
                              {e.status}
                            </span>
                          </div>

                          <button
                            onClick={() => e.id && onSelectEnquiry(e.id)}
                            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-lg text-slate-400 hover:text-slate-700 transition duration-150 flex items-center justify-center shadow-sm"
                            title="Open Enquiry Details"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 font-sans text-xs">
                      <span className="text-slate-500">
                        Showing <span className="font-semibold text-slate-700">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                        <span className="font-semibold text-slate-700">
                          {Math.min(currentPage * itemsPerPage, filteredEnquiries.length)}
                        </span>{' '}
                        of <span className="font-semibold text-slate-700">{filteredEnquiries.length}</span> logs
                      </span>

                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-slate-500 hover:text-slate-700 transition"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-slate-600 font-medium px-2">
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-lg text-slate-500 hover:text-slate-700 transition"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 font-sans text-sm">
                  {enquirySearchQuery ? 'No matched enquiries found.' : 'This salesperson does not have any linked enquiries yet.'}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 font-sans shadow-sm">
            Select a sales representative from the left pane to view their personal performance sheets.
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
                {editingSalesperson ? 'Edit Team Member Profile' : 'Add New Team Member'}
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
                  onChange={(e) => setFormInitials(e.target.value.toUpperCase())}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 uppercase font-mono focus:outline-none focus:border-blue-500"
                />
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
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Salesperson Email (Excludes from client contact detection)
                </label>
                <input
                  type="email"
                  placeholder="e.g. ameer@ourcompany.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Salesperson Direct Phone / Mobile (Excludes from client contact detection)
                </label>
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
