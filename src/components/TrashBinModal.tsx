import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Z_DRAWER, Z_BLOCKING_DIALOG } from '../constants/zIndex';
import { useEscapeLayer } from '../hooks/useEscapeLayer';
import { ESCAPE_PRIORITY_DRAWER, ESCAPE_PRIORITY_BLOCKING_DIALOG } from '../utils/escapeStack';
import { Trash2, AlertTriangle, Search, ShieldAlert, CheckCircle2, RotateCcw, X } from 'lucide-react';
import HoverScrollText from './common/HoverScrollText';
import { Enquiry, Company, Contact, Product, CallLogEntry, UserProfile, Workspace, Attachment, Quotation, Project, SupplierBill } from '../types';
import { EnquiryRepository } from '../services/repositories/EnquiryRepository';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { CallLogRepository } from '../services/repositories/CallLogRepository';
import { MetadataRepository } from '../services/repositories/MetadataRepository';
import { QuotationRepository } from '../services/repositories/QuotationRepository';
import { ProcurementRepository } from '../services/repositories/ProcurementRepository';
import { getDeletedWorkspaceProjects, restoreProject, purgeProjectPermanently } from '../services/projectService';
import { purgeEnquiryAttachments, purgeEntityStorageAssets } from '../services/attachmentStorage';

interface TrashBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  enquiries: Enquiry[];
  companies: Company[];
  contacts: Contact[];
  products: Product[];
  callLogs: CallLogEntry[];
  quotations?: Quotation[];
  projects?: Project[];
  setProjects?: React.Dispatch<React.SetStateAction<Project[]>>;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  onRefreshData: () => void;
  activeWorkspaceId?: string;
  activeWorkspace?: Workspace;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// Clean interface for dual-field workspace resolution
export interface WorkspaceScopedItem {
  workspace_id?: string;
  workspaceId?: string;
  is_deleted?: boolean;
}

export function getEntityWorkspaceId(item: WorkspaceScopedItem): string | undefined {
  return item.workspace_id ?? item.workspaceId;
}

type CategoryTab = 'all' | 'enquiries' | 'companies' | 'contacts' | 'products' | 'call_logs' | 'quotations' | 'supplier_bills' | 'projects';

type DeletedItemEntity = Enquiry | Company | Contact | Product | CallLogEntry | Quotation | Project | SupplierBill;

interface UnifiedDeletedItem {
  id: string;
  type: 'enquiry' | 'company' | 'contact' | 'product' | 'call_log' | 'quotation' | 'supplier_bill' | 'project';
  typeLabel: string;
  title: string;
  subTitle?: string;
  deletedAt?: string;
  deletedByName?: string;
  rawItem: DeletedItemEntity;
}

export const TrashBinModal: React.FC<TrashBinModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  enquiries,
  companies,
  contacts,
  products,
  callLogs,
  quotations,
  projects = [],
  setProjects,
  setEnquiries,
  onRefreshData,
  activeWorkspaceId,
  activeWorkspace,
  triggerToast
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [itemToPurge, setItemToPurge] = useState<UnifiedDeletedItem | null>(null);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [deletedQuotations, setDeletedQuotations] = useState<Quotation[]>(
    quotations?.filter((q) => q.is_deleted) || []
  );
  const [deletedSupplierBills, setDeletedSupplierBills] = useState<SupplierBill[]>([]);
  const [deletedProjectsState, setDeletedProjectsState] = useState<Project[]>(
    projects?.filter((p) => p.is_deleted) || []
  );

  const refreshDeletedQuotations = async () => {
    try {
      const qs = await QuotationRepository.getDeletedQuotations(activeWorkspaceId);
      setDeletedQuotations(qs);
    } catch (_) {}
  };

  const refreshDeletedSupplierBills = async () => {
    try {
      const bills = await ProcurementRepository.getDeletedSupplierBills(activeWorkspaceId);
      setDeletedSupplierBills(bills);
    } catch (_) {}
  };

  const refreshDeletedProjects = async () => {
    if (!activeWorkspaceId) return;
    try {
      const ps = await getDeletedWorkspaceProjects(activeWorkspaceId);
      setDeletedProjectsState(ps);
    } catch (_) {}
  };

  useEffect(() => {
    if (isOpen) {
      refreshDeletedQuotations();
      refreshDeletedSupplierBills();
      refreshDeletedProjects();
    }
  }, [isOpen, activeWorkspaceId]);

  useEscapeLayer(
    isOpen && Boolean(itemToPurge),
    () => {
      if (isProcessing) return false;
      setItemToPurge(null);
    },
    ESCAPE_PRIORITY_BLOCKING_DIALOG
  );

  useEscapeLayer(
    isOpen && showEmptyTrashConfirm,
    () => {
      if (isProcessing) return false;
      setShowEmptyTrashConfirm(false);
    },
    ESCAPE_PRIORITY_BLOCKING_DIALOG
  );

  useEscapeLayer(
    isOpen,
    () => {
      if (isProcessing) return false;
      onClose();
    },
    ESCAPE_PRIORITY_DRAWER
  );

  if (!isOpen) return null;

  const isAdmin = currentUser?.role === 'Admin';

  // Helper to check workspace boundary
  const isWsMatch = (wsId: string | undefined) => {
    if (!activeWorkspaceId) return true;
    const itemWs = wsId || 'ws_default';
    const currentWs = activeWorkspaceId || 'ws_default';
    return itemWs === currentWs;
  };

  // Extract soft-deleted items (strictly scoped by workspace via dual-field resolution)
  const deletedEnquiries = enquiries.filter((e) => e.is_deleted && isWsMatch(getEntityWorkspaceId(e)));
  const deletedCompanies = companies.filter((c) => c.is_deleted && isWsMatch(getEntityWorkspaceId(c)));
  const deletedContacts = contacts.filter((c) => c.is_deleted && isWsMatch(getEntityWorkspaceId(c)));
  const deletedProducts = products.filter((p) => p.is_deleted && isWsMatch(getEntityWorkspaceId(p)));
  const deletedCallLogs = callLogs.filter((l) => l.is_deleted && isWsMatch(getEntityWorkspaceId(l)));

  const deletedProjects = (() => {
    const map = new Map<string, Project>();
    projects.filter((p) => p.is_deleted && isWsMatch(getEntityWorkspaceId(p))).forEach((p) => {
      if (p.id) map.set(p.id, p);
    });
    deletedProjectsState.filter((p) => p.is_deleted && isWsMatch(getEntityWorkspaceId(p))).forEach((p) => {
      if (p.id) map.set(p.id, p);
    });
    return Array.from(map.values());
  })();

  const totalDeletedCount =
    deletedEnquiries.length +
    deletedCompanies.length +
    deletedContacts.length +
    deletedProducts.length +
    deletedCallLogs.length +
    deletedQuotations.length +
    deletedSupplierBills.length +
    deletedProjects.length;

  const items: UnifiedDeletedItem[] = [];

  if (activeTab === 'all' || activeTab === 'enquiries') {
    deletedEnquiries.forEach((e) => {
      items.push({
        id: e.id || '',
        type: 'enquiry',
        typeLabel: 'Enquiry',
        title: e.quote_ref_no ? `Quote Ref: ${e.quote_ref_no}` : `Enquiry #${e.sn}`,
        subTitle: e.subject || e.customer_reference_code || `Val: ${e.currency || 'AED'} ${e.value_aed?.toLocaleString()}`,
        deletedAt: e.deleted_at,
        deletedByName: e.deleted_by_name || 'Unknown',
        rawItem: e
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'companies') {
    deletedCompanies.forEach((c) => {
      items.push({
        id: c.id || '',
        type: 'company',
        typeLabel: 'Company',
        title: c.display_name || c.canonical_name,
        subTitle: `${c.city || ''}, ${c.country || ''}`.trim().replace(/^,|,$/g, ''),
        deletedAt: c.deleted_at,
        deletedByName: c.deleted_by_name || 'Unknown',
        rawItem: c
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'contacts') {
    deletedContacts.forEach((c) => {
      items.push({
        id: c.id || '',
        type: 'contact',
        typeLabel: 'Contact',
        title: c.full_name,
        subTitle: c.designation || c.email || c.mobile,
        deletedAt: c.deleted_at,
        deletedByName: c.deleted_by_name || 'Unknown',
        rawItem: c
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'products') {
    deletedProducts.forEach((p) => {
      const subParts = [
        p.sku ? `SKU: ${p.sku}` : null,
        p.brand_make ? `Brand: ${p.brand_make}` : null,
        p.product_type ? `Category: ${p.product_type}` : null,
        p.name && p.description && p.name !== p.description ? p.description : null
      ].filter(Boolean);
      items.push({
        id: p.id || '',
        type: 'product',
        typeLabel: 'Product',
        title: p.name || p.description || 'Catalog Product',
        subTitle: subParts.length > 0 ? subParts.join(' • ') : undefined,
        deletedAt: p.deleted_at,
        deletedByName: p.deleted_by_name || 'Unknown',
        rawItem: p
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'call_logs') {
    deletedCallLogs.forEach((l) => {
      items.push({
        id: l.id || '',
        type: 'call_log',
        typeLabel: 'Call Log',
        title: l.company_name ? `Call with ${l.company_name}` : `Call Log (${l.date})`,
        subTitle: l.requirement_notes || l.outcome || `Logged by ${l.logged_by}`,
        deletedAt: l.deleted_at,
        deletedByName: l.deleted_by_name || 'Unknown',
        rawItem: l
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'quotations') {
    deletedQuotations.forEach((q) => {
      const docTypeLabel =
        q.document_type === 'purchase_order'
          ? 'Supplier PO'
          : q.document_type === 'payment_voucher'
          ? 'Payment Voucher'
          : q.document_type === 'debit_note'
          ? 'Debit Note'
          : q.document_type === 'material_return_note'
          ? 'Material Return'
          : q.document_type === 'delivery_note'
          ? 'Delivery Note'
          : q.document_type === 'receipt'
          ? 'Receipt'
          : 'Quotation';
      items.push({
        id: q.id || '',
        type: 'quotation',
        typeLabel: docTypeLabel,
        title: `${q.formatted_quote_ref || q.quote_number} • ${q.currency || 'AED'} ${(q.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        subTitle: `${docTypeLabel} #${q.formatted_quote_ref || q.quote_number} (Rev ${q.revision_number ?? 0}) • Status: ${q.status || 'Draft'}`,
        deletedAt: q.deleted_at,
        deletedByName: q.deleted_by_name || 'Unknown',
        rawItem: q
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'supplier_bills') {
    deletedSupplierBills.forEach((b) => {
      items.push({
        id: b.id || '',
        type: 'supplier_bill',
        typeLabel: 'Supplier Bill',
        title: `${b.bill_number} • ${b.vendor_name || b.supplier_name || 'Vendor'} • ${b.currency || 'AED'} ${Number(b.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        subTitle: `Vendor Invoice: ${b.vendor_invoice_no || 'N/A'} ${b.po_ref ? `• PO: ${b.po_ref}` : ''}`,
        deletedAt: b.deleted_at,
        deletedByName: b.created_by || 'User',
        rawItem: b
      });
    });
  }

  if (activeTab === 'all' || activeTab === 'projects') {
    deletedProjects.forEach((p) => {
      items.push({
        id: p.id || '',
        type: 'project',
        typeLabel: 'Project',
        title: `${p.project_number} • ${p.title}`,
        subTitle: `${p.client_name} • AED ${Number(p.contract_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
        deletedAt: p.deleted_at,
        deletedByName: p.deleted_by_name || 'Unknown',
        rawItem: p
      });
    });
  }

  // Filter by search query
  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subTitle && item.subTitle.toLowerCase().includes(q)) ||
      (item.deletedByName && item.deletedByName.toLowerCase().includes(q))
    );
  });

  // Handle Restore
  const handleRestore = async (item: UnifiedDeletedItem) => {
    setIsProcessing(true);
    try {
      if (item.type === 'enquiry') {
        await EnquiryRepository.restore(item.id);
      } else if (item.type === 'company') {
        await CompanyRepository.restoreCompany(item.id);
      } else if (item.type === 'contact') {
        await CompanyRepository.restoreContact(item.id);
      } else if (item.type === 'product') {
        await MetadataRepository.restoreProduct(item.id);
      } else if (item.type === 'call_log') {
        await CallLogRepository.restore(item.id);
      } else if (item.type === 'quotation') {
        await QuotationRepository.restoreQuotation(item.id);
        await refreshDeletedQuotations();
        if (triggerToast) {
          triggerToast(`${item.typeLabel} ${item.title.split('•')[0].trim()} restored successfully.`, 'success');
        }
      } else if (item.type === 'supplier_bill') {
        await ProcurementRepository.restoreSupplierBill(item.id);
        await refreshDeletedSupplierBills();
        if (triggerToast) {
          triggerToast(`Supplier Bill ${item.title.split('•')[0].trim()} restored successfully.`, 'success');
        }
      } else if (item.type === 'project') {
        const proj = item.rawItem as Project;
        await restoreProject(proj);
        await refreshDeletedProjects();
        if (setProjects) {
          setProjects((prev) =>
            prev.map((p) => (p.id === proj.id ? { ...p, is_deleted: false } : p))
          );
        }
        if (proj.enquiry_id && setEnquiries) {
          setEnquiries((prev) =>
            prev.map((eq) =>
              eq.id === proj.enquiry_id
                ? { ...eq, project_id: proj.id, project_number: proj.project_number }
                : eq
            )
          );
        }
        if (triggerToast) {
          triggerToast(`Project ${proj.project_number} restored and re-linked to enquiry.`, 'success');
        }
      }
      onRefreshData();
    } catch (e) {
      console.error('Failed to restore item:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Purge Permanent with Cascade Storage Cleanup
  const handlePurge = async (item: UnifiedDeletedItem) => {
    setIsProcessing(true);
    try {
      if (item.type === 'enquiry') {
        const enquiry = item.rawItem as Enquiry;
        const rawAtts = enquiry.attachments;
        if (Array.isArray(rawAtts) && rawAtts.length > 0) {
          const strictAttachments: Attachment[] = rawAtts.filter(
            (att): att is Attachment => Boolean(att && typeof att === 'object')
          );
          if (strictAttachments.length > 0) {
            await purgeEnquiryAttachments(strictAttachments, activeWorkspace?.settings);
          }
        }
        await EnquiryRepository.purgePermanent(item.id);
        const snLabel = enquiry.sn ? `Enquiry #${enquiry.sn}` : 'Enquiry';
        if (triggerToast) {
          triggerToast(`${snLabel} and linked attachments permanently purged.`, 'info');
        }
      } else if (item.type === 'company') {
        await CompanyRepository.purgeCompanyPermanent(item.id);
      } else if (item.type === 'contact') {
        await CompanyRepository.purgeContactPermanent(item.id);
      } else if (item.type === 'product') {
        await purgeEntityStorageAssets('product', item.rawItem, activeWorkspace);
        await MetadataRepository.purgeProductPermanent(item.id);
      } else if (item.type === 'call_log') {
        await CallLogRepository.purgePermanent(item.id);
      } else if (item.type === 'quotation') {
        await purgeEntityStorageAssets('quotation', item.rawItem, activeWorkspace);
        await QuotationRepository.purgeQuotationPermanently(item.id);
        await refreshDeletedQuotations();
        if (triggerToast) {
          triggerToast(`${item.typeLabel} ${item.title.split('•')[0].trim()} and linked cloud assets permanently purged.`, 'info');
        }
      } else if (item.type === 'supplier_bill') {
        await ProcurementRepository.deleteSupplierBill(item.id, activeWorkspace?.settings?.storage, true);
        await refreshDeletedSupplierBills();
        if (triggerToast) {
          triggerToast(`Supplier Bill ${item.title.split('•')[0].trim()} and invoice scan permanently purged.`, 'info');
        }
      } else if (item.type === 'project') {
        await purgeEntityStorageAssets('project', item.rawItem, activeWorkspace);
        await purgeProjectPermanently(item.id);
        await refreshDeletedProjects();
        if (setProjects) {
          setProjects((prev) => prev.filter((p) => p.id !== item.id));
        }
        if (triggerToast) {
          triggerToast(`Project ${item.title.split('•')[0].trim()} permanently purged.`, 'info');
        }
      }
      setItemToPurge(null);
      setConfirmPurgeId(null);
      onRefreshData();
    } catch (e) {
      console.error('Failed to purge item:', e);
      if (triggerToast) {
        triggerToast('Failed to permanently purge record.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Empty Trash with Cascade Storage Cleanup
  const handleEmptyTrash = async () => {
    setIsProcessing(true);
    try {
      for (const item of items) {
        if (item.type === 'enquiry') {
          const enquiry = item.rawItem as Enquiry;
          const rawAtts = enquiry.attachments;
          if (Array.isArray(rawAtts) && rawAtts.length > 0) {
            const strictAttachments: Attachment[] = rawAtts.filter(
              (att): att is Attachment => Boolean(att && typeof att === 'object')
            );
            if (strictAttachments.length > 0) {
              await purgeEnquiryAttachments(strictAttachments, activeWorkspace?.settings);
            }
          }
          await EnquiryRepository.purgePermanent(item.id);
        } else if (item.type === 'company') {
          await CompanyRepository.purgeCompanyPermanent(item.id);
        } else if (item.type === 'contact') {
          await CompanyRepository.purgeContactPermanent(item.id);
        } else if (item.type === 'product') {
          await purgeEntityStorageAssets('product', item.rawItem, activeWorkspace);
          await MetadataRepository.purgeProductPermanent(item.id);
        } else if (item.type === 'call_log') {
          await CallLogRepository.purgePermanent(item.id);
        } else if (item.type === 'quotation') {
          await purgeEntityStorageAssets('quotation', item.rawItem, activeWorkspace);
          await QuotationRepository.purgeQuotationPermanently(item.id);
        } else if (item.type === 'supplier_bill') {
          await ProcurementRepository.deleteSupplierBill(item.id, activeWorkspace?.settings?.storage, true);
        } else if (item.type === 'project') {
          await purgeEntityStorageAssets('project', item.rawItem, activeWorkspace);
          await purgeProjectPermanently(item.id);
        }
      }
      await refreshDeletedQuotations();
      await refreshDeletedSupplierBills();
      await refreshDeletedProjects();
      setShowEmptyTrashConfirm(false);
      if (triggerToast) {
        triggerToast('Recycle bin emptied and cloud attachments permanently freed.', 'info');
      }
      onRefreshData();
    } catch (e) {
      console.error('Failed to empty trash:', e);
      if (triggerToast) {
        triggerToast('Failed to empty trash bin.', 'error');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${Z_DRAWER} flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-200`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recycle-bin-modal-title"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200/80 dark:border-rose-500/20 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="recycle-bin-modal-title" className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                  Recycle Bin & Data Recovery
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-semibold font-mono tabular-nums rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 whitespace-nowrap">
                  {totalDeletedCount} Items
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Safely inspect, restore, or permanently purge deleted workspace records.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && totalDeletedCount > 0 && (
              <button
                type="button"
                onClick={() => setShowEmptyTrashConfirm(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs font-semibold bg-rose-50 dark:bg-rose-600/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-600/30 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Empty Trash Bin</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Recycle Bin"
              title="Close (Esc)"
              className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Unified Toolbar & Category Filter Pills */}
        <div className="px-5 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All', count: totalDeletedCount },
              { id: 'enquiries', label: 'Enquiries', count: deletedEnquiries.length },
              { id: 'quotations', label: 'Quotes & Docs', count: deletedQuotations.length },
              { id: 'supplier_bills', label: 'Supplier Bills', count: deletedSupplierBills.length },
              { id: 'projects', label: 'Projects', count: deletedProjects.length },
              { id: 'companies', label: 'Companies', count: deletedCompanies.length },
              { id: 'contacts', label: 'Contacts', count: deletedContacts.length },
              { id: 'products', label: 'Products', count: deletedProducts.length },
              { id: 'call_logs', label: 'Call Logs', count: deletedCallLogs.length }
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as CategoryTab)}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border border-slate-900 dark:border-slate-100 shadow-2xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white hover:border-slate-300'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums leading-none ${
                        isActive
                          ? 'bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deleted records by title, details, or user..."
              className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-50/40 dark:bg-slate-950/30">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-11 h-11 text-slate-300 dark:text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Soft-Deleted Records Found</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                {searchQuery
                  ? 'No deleted items matched your search filters.'
                  : 'Your recycle bin is clean. Items marked as deleted will appear here for recovery.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="py-3 pl-3.5 pr-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl hover:border-slate-300 dark:hover:border-slate-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border mt-0.5 whitespace-nowrap shrink-0 ${
                        item.type === 'enquiry'
                          ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
                          : item.type === 'quotation'
                          ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20'
                          : item.type === 'company'
                          ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20'
                          : item.type === 'contact'
                          ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20'
                          : item.type === 'product'
                          ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20'
                          : 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-500/20'
                      }`}
                    >
                      {item.typeLabel}
                    </span>

                    <div className="min-w-0 flex-1">
                      <HoverScrollText
                        text={item.title}
                        as="h4"
                        className="text-xs font-semibold text-slate-900 dark:text-slate-100"
                      />
                      {item.subTitle && (
                        <HoverScrollText
                          text={item.subTitle}
                          className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5"
                        />
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono tabular-nums text-slate-400 dark:text-slate-500 mt-1">
                        {item.deletedAt && (
                          <span>Deleted: {new Date(item.deletedAt).toLocaleString()}</span>
                        )}
                        {item.deletedByName && <span>By: {item.deletedByName}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800/60 w-full sm:w-auto justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRestore(item)}
                      disabled={isProcessing}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                      <span>Restore</span>
                    </button>

                    {isAdmin && (
                      <>
                        <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => setItemToPurge(item)}
                          disabled={isProcessing}
                          className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200/80 dark:border-rose-500/20 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                          title="Delete Permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Delete Permanently</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Individual Item Purge Confirmation Modal */}
        {itemToPurge && createPortal(
          <div className={`fixed inset-0 ${Z_BLOCKING_DIALOG} flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150`}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-3">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {itemToPurge.type === 'enquiry'
                    ? `Permanently Delete Enquiry #${(itemToPurge.rawItem as Enquiry).sn || ''}?`
                    : `Permanently Delete ${itemToPurge.title || itemToPurge.typeLabel}?`}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                {itemToPurge.type === 'enquiry'
                  ? 'This will permanently delete this enquiry record and reclaim storage by deleting all attached proposal documents from cloud storage. This action cannot be undone.'
                  : 'This will permanently delete this record from the database. This action cannot be undone.'}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setItemToPurge(null)}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handlePurge(itemToPurge)}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Empty Trash Confirmation Modal */}
        {showEmptyTrashConfirm && createPortal(
          <div className={`fixed inset-0 ${Z_BLOCKING_DIALOG} flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150`}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 mb-3">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Empty Entire Workspace Recycle Bin?</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                Are you sure you want to permanently delete all {totalDeletedCount} items in the recycle bin? All associated proposal attachments will be deleted from Supabase cloud storage to free quota. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmptyTrashConfirm(false)}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEmptyTrash}
                  disabled={isProcessing}
                  className="px-3.5 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  Empty Bin & Free Storage
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">Soft-Delete Conflict Shield Active — Edits merge safely with queued records.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold transition-colors cursor-pointer shrink-0"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TrashBinModal;
