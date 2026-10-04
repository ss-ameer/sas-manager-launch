import React, { useState, useMemo, useEffect } from 'react';
import { Project, Product, Workspace, UserProfile, LineItem, ProjectMilestone } from '../types';
import { dispatchProjectStock } from '../services/inventoryService';
import { updateProjectStatus } from '../services/projectService';
import { safeUpdateDoc, safeAddDoc, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';
import {
  Briefcase,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  Boxes,
  Eye,
  X,
  AlertTriangle,
  Building,
  DollarSign,
  FileText,
  User,
  ArrowRight,
  Filter,
  Check,
  Calendar,
  Layers,
  MapPin,
  ShieldAlert,
  Info,
  Circle,
  PlayCircle,
  Flag,
  Download
} from 'lucide-react';

interface ProjectRegistryProps {
  projects: Project[];
  setProjects?: React.Dispatch<React.SetStateAction<Project[]>>;
  products?: Product[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  activeWorkspace: Workspace;
  user: UserProfile;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onOpenMobileMenu?: () => void;
  initialProjectId?: string | null;
  onClearInitialProject?: () => void;
}

export default function ProjectRegistry({
  projects,
  setProjects,
  products = [],
  setProducts,
  activeWorkspace,
  user,
  triggerToast,
  onOpenMobileMenu,
  initialProjectId,
  onClearInitialProject
}: ProjectRegistryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | Project['status']>('All');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [confirmDispatchOpen, setConfirmDispatchOpen] = useState(false);
  const [voidConfirmTarget, setVoidConfirmTarget] = useState<Project | null>(null);
  const [isVoiding, setIsVoiding] = useState<boolean>(false);
  const [milestoneWarning, setMilestoneWarning] = useState<{
    milestoneId: string;
    targetStatus: ProjectMilestone['status'];
    targetTitle: string;
    precedingTitle: string;
  } | null>(null);

  // Automatic deep-link / navigation to target project
  useEffect(() => {
    if (initialProjectId) {
      const match = projects.find(
        (p) => p.id === initialProjectId || p.project_number === initialProjectId
      );
      if (match) {
        setSelectedProject(match);
      }
    }
  }, [initialProjectId, projects]);

  const handleCloseModal = () => {
    setSelectedProject(null);
    onClearInitialProject?.();
  };

  // Multi-Tenant Isolation: Ensure only active workspace projects are shown
  const workspaceProjects = useMemo(() => {
    return projects.filter((p) => {
      const wId = p.workspace_id || (p as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && activeWorkspace.id === 'ws_default');
    });
  }, [projects, activeWorkspace.id]);

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return workspaceProjects.filter((p) => {
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (p.project_number || '').toLowerCase().includes(q) ||
        (p.title || '').toLowerCase().includes(q) ||
        (p.client_name || '').toLowerCase().includes(q) ||
        (p.project_type || '').toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [workspaceProjects, statusFilter, searchTerm]);

  // Quick KPI calculation
  const kpis = useMemo(() => {
    let activeCount = 0;
    let pendingDispatchCount = 0;
    let totalValue = 0;
    let deliveredCount = 0;

    workspaceProjects.forEach((p) => {
      totalValue += Number(p.contract_value) || 0;
      if (p.status === 'In Progress' || p.status === 'Draft') {
        activeCount++;
        if (!(p as any).stock_deducted && p.status !== 'Cancelled') {
          pendingDispatchCount++;
        }
      } else if (p.status === 'Delivered' || p.status === 'Completed') {
        deliveredCount++;
      }
    });

    return {
      activeCount,
      pendingDispatchCount,
      totalValue,
      deliveredCount
    };
  }, [workspaceProjects]);

  // Helper product lookup
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((prod) => {
      if (prod.id) map.set(prod.id, prod);
    });
    return map;
  }, [products]);

  // Handle stock dispatch & status transition to 'Delivered'
  const handleExecuteDispatch = async () => {
    if (!selectedProject || isDispatching) return;
    setIsDispatching(true);

    try {
      const result = await dispatchProjectStock(selectedProject, user);
      const hasDeductedPhysicalStock = result.dispatchedCount > 0;

      const nowIso = new Date().toISOString();
      const updatedProject: Project = {
        ...selectedProject,
        status: 'Delivered',
        updated_at: nowIso,
        ...( {
          dispatched_at: nowIso,
          stock_deducted: hasDeductedPhysicalStock,
          dispatched_items_count: result.dispatchedCount,
          fulfillment_type: hasDeductedPhysicalStock ? 'WAREHOUSE_DISPATCH' : 'SERVICE_FULFILLMENT'
        } as any )
      };

      // Update parent projects state
      if (setProjects) {
        setProjects((prev) =>
          prev.map((p) => (p.id === selectedProject.id ? updatedProject : p))
        );
      }
      setSelectedProject(updatedProject);
      setConfirmDispatchOpen(false);

      // Re-fetch products locally to update on-hand / reserved state immediately
      if (setProducts) {
        try {
          const updatedProds = await Promise.all(
            (selectedProject.line_items || [])
              .filter((it) => it.product_id)
              .map(async (it) => {
                const pSnap = await getDoc(doc(db, 'products', it.product_id!));
                return pSnap.exists() ? ({ id: pSnap.id, ...pSnap.data() } as Product) : null;
              })
          );
          const validProds = updatedProds.filter((p): p is Product => p !== null);
          if (validProds.length > 0) {
            setProducts((prev) =>
              prev.map((oldP) => {
                const refreshed = validProds.find((v) => v.id === oldP.id);
                return refreshed || oldP;
              })
            );
          }
        } catch (e) {
          console.warn('Failed local product refresh after dispatch:', e);
        }
      }

      if (triggerToast) {
        if (result.dispatchedCount > 0) {
          triggerToast(
            `Project ${selectedProject.project_number} dispatched! Deducted ${result.dispatchedCount} warehouse items.`,
            'success'
          );
        } else {
          triggerToast(
            `Project ${selectedProject.project_number} marked as fulfilled.`,
            'success'
          );
        }
      }
    } catch (err: any) {
      console.error('Failed executing project dispatch:', err);
      if (triggerToast) {
        triggerToast('Failed to dispatch stock: ' + err.message, 'error');
      }
    } finally {
      setIsDispatching(false);
    }
  };

  // Quick Status Transition
  const handleUpdateStatus = async (newStatus: Project['status']) => {
    if (!selectedProject?.id || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await updateProjectStatus(selectedProject.id, newStatus, user);
      const updated: Project = {
        ...selectedProject,
        status: newStatus,
        updated_at: new Date().toISOString()
      };
      if (setProjects) {
        setProjects((prev) => prev.map((p) => (p.id === selectedProject.id ? updated : p)));
      }
      setSelectedProject(updated);
      if (triggerToast) {
        triggerToast(`Project status updated to ${newStatus}`, 'success');
      }
    } catch (err: any) {
      console.error('Failed to update status:', err);
      if (triggerToast) {
        triggerToast('Failed to update status: ' + err.message, 'error');
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleInitiateVoidProject = (project: Project) => {
    setVoidConfirmTarget(project);
  };

  const handleConfirmVoidProject = async (project: Project) => {
    if (!project?.id || isVoiding) return;
    setIsVoiding(true);
    const nowIso = new Date().toISOString();
    const userName = user?.full_name || (user as any)?.username || user?.email || 'Operator';
    const userUid = user?.uid;

    try {
      // 1. Release reserved stock back to catalog for inventoried line items (if physical stock was not yet dispatched)
      const didDeductStock = Boolean((project as any).stock_deducted);
      if (!didDeductStock && project.line_items && project.line_items.length > 0) {
        for (const item of project.line_items) {
          if (!item.product_id) continue;
          try {
            const prodRef = doc(db, 'products', item.product_id);
            const prodSnap = await getDoc(prodRef);
            if (prodSnap.exists()) {
              const prodData = prodSnap.data() as Product;
              if (prodData.is_inventoried) {
                const currentReserved = Number(prodData.stock_reserved) || 0;
                const qty = Number(item.quantity) || 0;
                const newReserved = Math.max(0, currentReserved - qty);
                await safeUpdateDoc('products', item.product_id, {
                  stock_reserved: newReserved,
                  updatedAt: nowIso
                });

                // Update local products state if provided
                if (setProducts) {
                  setProducts(prev => prev.map(p => p.id === item.product_id ? { ...p, stock_reserved: newReserved } : p));
                }

                // Add immutable stock movement audit record
                await safeAddDoc('stock_movements', {
                  product_id: item.product_id,
                  workspace_id: activeWorkspace.id,
                  movement_type: 'STOCK_RELEASE',
                  quantity: qty,
                  previous_on_hand: Number(prodData.stock_on_hand) || 0,
                  new_on_hand: Number(prodData.stock_on_hand) || 0,
                  reference_type: 'PROJECT_VOID',
                  reference_id: project.id,
                  reference_number: project.project_number,
                  reason_notes: `Stock reservation released: Project #${project.project_number} voided/cancelled by ${userName}`,
                  created_at: nowIso,
                  created_by_uid: userUid,
                  created_by_name: userName
                });
              }
            }
          } catch (stockErr) {
            console.warn(`[handleConfirmVoidProject] Failed releasing stock for product ${item.product_id}:`, stockErr);
          }
        }
      }

      // 2. Update the project document in Firestore
      const updateData = {
        status: 'Cancelled' as const,
        cancellation_reason: 'Voided by operator via Project Registry',
        updated_at: nowIso
      };
      await safeUpdateDoc('projects', project.id, updateData);

      // 3. If the project has an associated enquiry_id, flag the parent enquiry
      if (project.enquiry_id) {
        try {
          await safeUpdateDoc('enquiries', project.enquiry_id, {
            project_status: 'Cancelled',
            stock_reserved: false,
            updatedAt: nowIso
          });
        } catch (enqErr) {
          console.warn('[handleConfirmVoidProject] Failed to update parent enquiry:', enqErr);
        }
      }

      // 4. Update local state
      const updatedProject: Project = {
        ...project,
        ...updateData
      };
      if (setProjects) {
        setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
      }
      setSelectedProject(updatedProject);
      setVoidConfirmTarget(null);

      if (triggerToast) {
        triggerToast('Project has been marked Cancelled and reserved inventory returned to catalog.', 'info');
      }
    } catch (err: any) {
      console.error('Failed to void project:', err);
      if (triggerToast) {
        triggerToast('Failed to void project: ' + err.message, 'error');
      } else {
        alert('Failed to void project: ' + err.message);
      }
    } finally {
      setIsVoiding(false);
    }
  };

  const executeMilestoneStatusChange = async (
    milestoneId: string,
    nextStatus: ProjectMilestone['status']
  ) => {
    if (!selectedProject?.milestones) return;
    const updatedMilestones = selectedProject.milestones.map((m) => {
      if (m.id !== milestoneId) return m;
      const updated: ProjectMilestone = { ...m, status: nextStatus };
      if (nextStatus === 'Completed') {
        updated.completed_at = new Date().toISOString();
      } else {
        delete updated.completed_at;
      }
      return updated;
    });

    const allCompleted =
      updatedMilestones.length > 0 && updatedMilestones.every((m) => m.status === 'Completed');
    const shouldMarkCompleted =
      allCompleted &&
      selectedProject.status !== 'Completed' &&
      selectedProject.status !== 'Delivered';

    const nowIso = new Date().toISOString();
    const updatedProj: Project = {
      ...selectedProject,
      milestones: updatedMilestones,
      status: shouldMarkCompleted ? 'Completed' : selectedProject.status,
      updated_at: nowIso
    };

    setSelectedProject(updatedProj);
    if (setProjects) {
      setProjects((prev) => prev.map((p) => (p.id === selectedProject.id ? updatedProj : p)));
    }
    setMilestoneWarning(null);

    if (selectedProject.id) {
      const updateData: Partial<Project> = {
        milestones: updatedMilestones,
        updated_at: nowIso
      };
      if (shouldMarkCompleted) {
        updateData.status = 'Completed';
      }
      await safeUpdateDoc('projects', selectedProject.id, updateData).catch((err) =>
        console.error('Failed to save milestone:', err)
      );
      if (shouldMarkCompleted && triggerToast) {
        triggerToast('All operational milestones completed! Project marked as Completed.', 'success');
      }
    }
  };

  // Milestone Progression Cycle: Pending -> In Progress -> Completed -> Pending
  const handleToggleMilestone = async (milestoneId: string) => {
    if (!selectedProject?.id || !selectedProject.milestones) return;
    if (selectedProject.status === 'Cancelled') {
      if (triggerToast) {
        triggerToast('Cannot advance milestones on a cancelled project.', 'info');
      }
      return;
    }

    const currentIndex = selectedProject.milestones.findIndex((m) => m.id === milestoneId);
    if (currentIndex === -1) return;

    const current = selectedProject.milestones[currentIndex];
    let nextStatus: ProjectMilestone['status'];
    if (current.status === 'Pending') {
      nextStatus = 'In Progress';
    } else if (current.status === 'In Progress') {
      nextStatus = 'Completed';
    } else {
      nextStatus = 'Pending';
    }

    // Sequence Check:
    // If nextStatus === 'Completed': ensure all preceding milestones are Completed
    // If nextStatus === 'In Progress': ensure preceding milestones are not Pending
    if (nextStatus === 'Completed') {
      const precedingIncomplete = selectedProject.milestones
        .slice(0, currentIndex)
        .find((m) => m.status !== 'Completed');

      if (precedingIncomplete) {
        setMilestoneWarning({
          milestoneId,
          targetStatus: nextStatus,
          targetTitle: current.title,
          precedingTitle: precedingIncomplete.title
        });
        return;
      }
    } else if (nextStatus === 'In Progress') {
      const precedingPending = selectedProject.milestones
        .slice(0, currentIndex)
        .find((m) => m.status === 'Pending');

      if (precedingPending) {
        setMilestoneWarning({
          milestoneId,
          targetStatus: nextStatus,
          targetTitle: current.title,
          precedingTitle: precedingPending.title
        });
        return;
      }
    }

    await executeMilestoneStatusChange(milestoneId, nextStatus);
  };

  const getStatusBadge = (status: Project['status'], isDeducted?: boolean) => {
    switch (status) {
      case 'In Progress':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span>In Progress</span>
          </span>
        );
      case 'Delivered':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1">
            <Truck className="w-3 h-3 text-emerald-600" />
            <span>Delivered / Dispatched</span>
          </span>
        );
      case 'Completed':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3 text-teal-600" />
            <span>Completed</span>
          </span>
        );
      case 'Cancelled':
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center space-x-1">
            <X className="w-3 h-3 text-rose-500" />
            <span>Cancelled</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700 flex items-center space-x-1">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>Draft</span>
          </span>
        );
    }
  };

  const handleExportCsv = () => {
    if (!filteredProjects || filteredProjects.length === 0) {
      if (triggerToast) {
        triggerToast('No projects to export.', 'info');
      } else {
        alert('No projects to export.');
      }
      return;
    }

    const headers = [
      'Project Ref',
      'Client',
      'Project Title',
      'Type',
      'Value (AED)',
      'Fulfillment Status',
      'Created Date'
    ];

    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = filteredProjects.map((p) => [
      escapeCsv(p.project_number),
      escapeCsv(p.client_name),
      escapeCsv(p.title),
      escapeCsv(p.project_type),
      escapeCsv(Number(p.contract_value || 0).toFixed(2)),
      escapeCsv(p.status),
      escapeCsv(p.created_at ? new Date(p.created_at).toLocaleDateString() : '')
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.href = url;
    link.setAttribute('download', `projects-registry-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    if (triggerToast) {
      triggerToast(`Exported ${filteredProjects.length} project(s) to CSV.`, 'success');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects & Operations"
        subtitle="Manage job orders, delivery milestones, and warehouse inventory fulfillment."
        icon={Briefcase}
        badge={{ text: `${workspaceProjects.length} Projects`, variant: 'blue' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        secondaryActions={[
          {
            label: 'Export Projects CSV',
            icon: Download,
            onClick: handleExportCsv,
            variant: 'outline'
          }
        ]}
      />

      <PageBody maxWidth="max-w-7xl">
        {/* Quick KPI Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Active Projects
              </span>
              <span className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <Briefcase className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-sans text-slate-900 dark:text-white">
                {kpis.activeCount}
              </span>
              <span className="text-xs text-slate-400">In Progress / Draft</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pending Dispatch
              </span>
              <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                <Boxes className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-sans text-amber-600 dark:text-amber-400">
                {kpis.pendingDispatchCount}
              </span>
              <span className="text-xs text-slate-400">Awaiting Delivery</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Dispatched & Completed
              </span>
              <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <Truck className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-sans text-emerald-600 dark:text-emerald-400">
                {kpis.deliveredCount}
              </span>
              <span className="text-xs text-slate-400">Fulfilled Jobs</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Operational Value
              </span>
              <span className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
                <DollarSign className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {kpis.totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
              <span className="text-xs text-slate-400">AED Total</span>
            </div>
          </div>
        </div>

        {/* Unified Search, Filters & Projects Directory Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl md:rounded-3xl p-6 shadow-xs space-y-6">
          {/* Section Tag */}
          <div className="flex items-center space-x-1.5 text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 font-bold">
            <Filter className="w-3.5 h-3.5" />
            <span>Operational Search & Filters</span>
          </div>

          {/* Search Bar & Status Filter Pills */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search projects by reference, client, title..."
                className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-sans"
              />
            </div>

            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
              {(['All', 'In Progress', 'Delivered', 'Completed', 'Cancelled'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Projects Table */}
          <div className="overflow-x-auto">
            {filteredProjects.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 font-sans">
                  No Projects Found
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Projects are instantiated when Won enquiries are converted via the "Convert to Project / Fulfillment" button.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                    <th className="py-3.5 px-4 w-36 whitespace-nowrap">Project Ref</th>
                    <th className="py-3.5 px-4 min-w-[200px]">Client & Title</th>
                    <th className="py-3.5 px-4 w-32 whitespace-nowrap">Type</th>
                    <th className="py-3.5 px-4 text-right w-36 whitespace-nowrap">Value (AED)</th>
                    <th className="py-3.5 px-4 text-center w-40 whitespace-nowrap">Fulfillment Status</th>
                    <th className="py-3.5 px-4 text-center w-36 whitespace-nowrap">Dispatch</th>
                    <th className="py-3.5 px-4 text-right w-24 whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                  {filteredProjects.map((project) => {
                    const isDelivered = project.status === 'Delivered' || project.status === 'Completed';
                    const inventoriedCount = (project.line_items || []).filter((it) => {
                      if (!it.product_id) return false;
                      const p = productMap?.get(it.product_id);
                      return p ? Boolean(p.is_inventoried) : false;
                    }).length;
                    const totalLinesCount = (project.line_items || []).length;
                    const didDeductStock = Boolean(
                      (project as any).stock_deducted &&
                      ((project as any).dispatched_items_count ?? (inventoriedCount > 0 ? 1 : 0)) > 0
                    );

                    return (
                      <tr
                        key={project.id || project.project_number}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition cursor-pointer"
                        onClick={() => setSelectedProject(project)}
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {project.project_number}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 dark:text-white font-sans truncate max-w-xs md:max-w-sm">
                            {project.title}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center space-x-1 mt-0.5">
                            <Building className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{project.client_name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {project.project_type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          {Number(project.contract_value).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {getStatusBadge(project.status, didDeductStock)}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          {isDelivered ? (
                            didDeductStock ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                <Check className="w-3 h-3" />
                                <span>STOCK OUT</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>FULFILLED</span>
                              </span>
                            )
                          ) : inventoriedCount > 0 ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40">
                              <Boxes className="w-3 h-3" />
                              <span>{inventoriedCount} Reserved</span>
                            </span>
                          ) : totalLinesCount > 0 ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-800">
                              Non-Stock Scope
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No Items</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProject(project);
                            }}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition flex items-center space-x-1 ml-auto cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Standardized Card Footer & Item Counter */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-sans">
            <div>
              Showing <span className="font-bold text-slate-800 dark:text-slate-200">{filteredProjects.length}</span> of <span className="font-bold text-slate-800 dark:text-slate-200">{workspaceProjects.length}</span> projects
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Active Workspace Registry
            </div>
          </div>
        </div>
      </PageBody>

      {/* Project Details & Fulfillment Modal */}
      {selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-8 md:p-10 lg:px-16 lg:py-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl xl:max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 sm:px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <span className="p-2.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                  <Briefcase className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white font-sans">
                      {selectedProject.project_number}
                    </h3>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {selectedProject.project_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-sans">{selectedProject.title}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {getStatusBadge(selectedProject.status, Boolean((selectedProject as any).stock_deducted))}
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 sm:px-8 py-6 space-y-6 overflow-y-auto flex-1 font-sans">
              {selectedProject.status === 'Cancelled' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center space-x-3 text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <div className="text-xs font-semibold">
                    This project has been cancelled. Milestones and stock deductions are locked.
                    {selectedProject.cancellation_reason && (
                      <span className="block text-[11px] font-normal text-rose-600/80 dark:text-rose-400/80 mt-0.5 font-mono">
                        Reason: {selectedProject.cancellation_reason}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Metadata Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                    Client Account
                  </span>
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                    <Building className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>{selectedProject.client_name}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                    Contract Value
                  </span>
                  <div className="font-bold text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                    AED{' '}
                    {Number(selectedProject.contract_value).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                    Created / Initiated
                  </span>
                  <div className="font-medium text-xs text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {selectedProject.created_at
                        ? new Date(selectedProject.created_at).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Secondary Operational Metadata Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                    Lead Engineer
                  </span>
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                    <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span className="truncate">{selectedProject.assigned_engineer_name || 'Unassigned'}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                    Site / Delivery Location
                  </span>
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="truncate">{selectedProject.site_location || 'Not Specified'}</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                    Target Delivery / Handover
                  </span>
                  <div className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center space-x-1.5 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      {selectedProject.target_delivery_date
                        ? new Date(selectedProject.target_delivery_date).toLocaleDateString()
                        : 'Unscheduled'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Interactive Milestone Pipeline */}
              {selectedProject.milestones && selectedProject.milestones.length > 0 && (() => {
                const totalMilestones = selectedProject.milestones.length;
                const completedCount = selectedProject.milestones.filter((m) => m.status === 'Completed').length;
                const progressPercent = Math.round((completedCount / totalMilestones) * 100);

                return (
                  <div className="space-y-3 p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2">
                        <Flag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <h4 className="text-xs font-mono uppercase tracking-widest text-slate-700 dark:text-slate-300 font-bold">
                          Operational Milestones & Field Execution
                        </h4>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {completedCount} / {totalMilestones} Completed ({progressPercent}%)
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>

                    {/* Milestone List */}
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {selectedProject.milestones.map((m, idx) => {
                        const isCompleted = m.status === 'Completed';
                        const isInProgress = m.status === 'In Progress';
                        const isPending = m.status === 'Pending';

                        return (
                          <div
                            key={m.id || idx}
                            className={`p-3 rounded-xl border transition flex items-center justify-between gap-3 ${
                              isCompleted
                                ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60'
                                : isInProgress
                                ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/60 shadow-2xs'
                                : 'bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800'
                            }`}
                          >
                            <div className="flex items-center space-x-3 min-w-0">
                              <span
                                className={`w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                                  isCompleted
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                    : isInProgress
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {idx + 1}
                              </span>

                              <div className="min-w-0">
                                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 flex items-center space-x-2">
                                  <span className="truncate">{m.title}</span>
                                </div>
                                {m.completed_at && (
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                                    Signed off: {new Date(m.completed_at).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Interactive Status Toggle Button */}
                            <button
                              type="button"
                              onClick={() => handleToggleMilestone(m.id)}
                              title="Click to cycle status: Pending ➔ In Progress ➔ Completed"
                              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold flex items-center space-x-1.5 transition cursor-pointer ${
                                isCompleted
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                                  : isInProgress
                                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {isCompleted && (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  <span>Completed</span>
                                </>
                              )}
                              {isInProgress && (
                                <>
                                  <PlayCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
                                  <span>In Progress</span>
                                </>
                              )}
                              {isPending && (
                                <>
                                  <Circle className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Pending</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 pt-1 font-mono">
                      <span>Click milestone status to advance phase</span>
                      <span>Cycle: Pending ➔ In Progress ➔ Completed</span>
                    </div>
                  </div>
                );
              })()}

              {/* Line Items Breakdown Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-slate-500 font-bold">
                    Project Line Items & Warehouse Stock
                  </h4>
                  <span className="text-xs text-slate-400">
                    {selectedProject.line_items?.length || 0} line items
                  </span>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/75 dark:bg-slate-800/50 text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                        <th className="py-2.5 px-3">Item Description</th>
                        <th className="py-2.5 px-3">Qty & Unit</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                        <th className="py-2.5 px-3 text-center">Warehouse Stock Info</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {(selectedProject.line_items || []).map((it, idx) => {
                        const linkedProduct = it.product_id ? productMap.get(it.product_id) : null;
                        const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);

                        return (
                          <tr key={it.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-800 dark:text-slate-100">
                                {it.item_name || (it.product_id ? productMap?.get(it.product_id)?.name : null) || it.description || 'Line Item'}
                              </div>
                              {it.description && it.description !== (it.item_name || (it.product_id ? productMap?.get(it.product_id)?.name : null)) && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                  {it.description}
                                </div>
                              )}
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                Type: {it.product_type || 'General'}
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono font-medium whitespace-nowrap">
                              {it.quantity} {it.unit || 'Nos'}
                            </td>
                            <td className="py-3 px-3 text-right font-mono whitespace-nowrap">
                              {Number(it.unit_price || 0).toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                              {lineTotal.toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {linkedProduct ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    On-Hand: {linkedProduct.stock_on_hand ?? 0} | Res: {linkedProduct.stock_reserved ?? 0}
                                  </span>
                                  {linkedProduct.storage_location && (
                                    <span className="text-[9px] text-slate-400 font-mono mt-0.5 flex items-center space-x-0.5">
                                      <MapPin className="w-2.5 h-2.5" />
                                      <span>{linkedProduct.storage_location}</span>
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">
                                  Non-inventoried / Custom item
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Operational Remarks */}
              {selectedProject.operational_notes && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block mb-1">
                    Operational Notes
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {selectedProject.operational_notes}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Operations Action Bar */}
            <div className="py-4 px-6 sm:px-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono text-slate-400">Change Status:</span>
                  <select
                    value={selectedProject.status}
                    disabled={isUpdatingStatus}
                    onChange={(e) => handleUpdateStatus(e.target.value as Project['status'])}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="Draft">Draft</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                {selectedProject.status !== 'Cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleInitiateVoidProject(selectedProject)}
                    className="px-3.5 py-1.5 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                    title="Cancel project and release reserved stock"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Void / Cancel Project</span>
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-3">
                {(() => {
                  const projectItems = selectedProject.line_items || [];
                  const hasItems = projectItems.length > 0;
                  const hasInventoriedItems = projectItems.some((it) => {
                    if (!it.product_id) return false;
                    const p = productMap?.get(it.product_id);
                    return p ? Boolean(p.is_inventoried) : false;
                  });

                  if (selectedProject.status === 'Cancelled') {
                    return (
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center space-x-1">
                        <X className="w-4 h-4" />
                        <span>Project Cancelled</span>
                      </span>
                    );
                  }

                  const isModalProjectDelivered =
                    selectedProject.status === 'Delivered' ||
                    selectedProject.status === 'Completed' ||
                    Boolean((selectedProject as any).stock_deducted);
                  const modalDidDeductStock = Boolean(
                    (selectedProject as any).stock_deducted &&
                    ((selectedProject as any).dispatched_items_count ?? (hasInventoriedItems ? 1 : 0)) > 0
                  );

                  if (isModalProjectDelivered) {
                    if (modalDidDeductStock) {
                      return (
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                          <Check className="w-4 h-4" />
                          <span>Warehouse Stock Dispatched</span>
                        </span>
                      );
                    }
                    return (
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Scope Fulfilled (Non-Stock)</span>
                      </span>
                    );
                  }

                  if (!hasItems) {
                    return (
                      <button
                        type="button"
                        disabled={true}
                        title="Cannot dispatch a project with 0 line items"
                        className="px-4 py-2 opacity-50 cursor-not-allowed bg-slate-400 text-white font-bold text-xs rounded-xl shadow-xs flex items-center space-x-1.5"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Mark Dispatched</span>
                      </button>
                    );
                  }

                  if (!hasInventoriedItems) {
                    return (
                      <button
                        type="button"
                        onClick={() => setConfirmDispatchOpen(true)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Mark Fulfilled / Dispatched</span>
                      </button>
                    );
                  }

                  return (
                    <button
                      type="button"
                      onClick={() => setConfirmDispatchOpen(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Truck className="w-4 h-4" />
                      <span>Mark Dispatched & Deduct Stock</span>
                    </button>
                  );
                })()}

                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Stock Deduction */}
      {confirmDispatchOpen && selectedProject && (() => {
        const modalItems = selectedProject.line_items || [];
        const modalHasInventoried = modalItems.some((it) => {
          if (!it.product_id) return false;
          const p = productMap?.get(it.product_id);
          return p ? Boolean(p.is_inventoried) : false;
        });

        return (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center space-x-3">
                <span className={`p-2 rounded-xl ${modalHasInventoried ? 'bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'}`}>
                  {modalHasInventoried ? <Truck className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans">
                  {modalHasInventoried ? 'Confirm Warehouse Stock Dispatch' : 'Confirm Project Fulfillment'}
                </h3>
              </div>
              {modalHasInventoried ? (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                    Marking project <strong className="font-mono text-slate-900 dark:text-white">{selectedProject.project_number}</strong> as Dispatched will deduct physical inventory from the warehouse for all linked catalog products and log immutable <span className="font-mono font-bold text-emerald-600">STOCK_OUT</span> audit entries.
                  </p>
                  <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-xl text-[11px] text-amber-800 dark:text-amber-300 flex items-start space-x-2">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <span>
                      This operation updates live stock-on-hand and stock-reserved counters in Firestore.
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
                    This project contains custom/service scope without physical warehouse inventory. Mark as fulfilled?
                  </p>
                  <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 rounded-xl text-[11px] text-blue-800 dark:text-blue-300 flex items-start space-x-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                    <span>
                      Project status will advance to Delivered without deducting warehouse inventory counts.
                    </span>
                  </div>
                </>
              )}
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  disabled={isDispatching}
                  onClick={() => setConfirmDispatchOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDispatching}
                  onClick={handleExecuteDispatch}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
                >
                  {isDispatching && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  <span>
                    {isDispatching
                      ? modalHasInventoried ? 'Deducting Stock...' : 'Updating Project...'
                      : modalHasInventoried ? 'Confirm Dispatch' : 'Confirm Fulfillment'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Soft Milestone Sequence Warning Modal */}
      {milestoneWarning && (
        <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3">
              <span className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-sans">
                Preceding Phase Still Incomplete
              </h3>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
              Phase <strong className="text-slate-900 dark:text-white font-semibold">'{milestoneWarning.precedingTitle}'</strong> has not been marked as completed yet. Are you sure you want to advance <strong className="text-slate-900 dark:text-white font-semibold">'{milestoneWarning.targetTitle}'</strong> to <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{milestoneWarning.targetStatus}</span>?
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setMilestoneWarning(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeMilestoneStatusChange(milestoneWarning.milestoneId, milestoneWarning.targetStatus)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Proceed Anyway</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Voiding / Cancelling Project */}
      {voidConfirmTarget && (
        <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3">
              <span className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans">
                  Void / Cancel Project #{voidConfirmTarget.project_number}
                </h3>
                <span className="text-[11px] font-mono text-slate-400">{voidConfirmTarget.title}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-sans">
              Are you sure you want to void this project? This will mark the project as <strong className="text-rose-600 dark:text-rose-400">Cancelled</strong>, unlock/release all reserved catalog stock back to the warehouse, and lock operational milestones.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isVoiding}
                onClick={() => setVoidConfirmTarget(null)}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Keep Project
              </button>
              <button
                type="button"
                disabled={isVoiding}
                onClick={() => handleConfirmVoidProject(voidConfirmTarget)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                {isVoiding && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{isVoiding ? 'Voiding...' : 'Yes, Void Project'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
