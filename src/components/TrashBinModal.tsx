import React, { useState } from 'react';
import { Trash2, RefreshCw, AlertTriangle, Search, Filter, ShieldAlert, CheckCircle2, RotateCcw } from 'lucide-react';
import { Enquiry, Company, Contact, Product, CallLogEntry, UserProfile } from '../types';
import { EnquiryRepository } from '../services/repositories/EnquiryRepository';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { CallLogRepository } from '../services/repositories/CallLogRepository';
import { MetadataRepository } from '../services/repositories/MetadataRepository';

interface TrashBinModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  enquiries: Enquiry[];
  companies: Company[];
  contacts: Contact[];
  products: Product[];
  callLogs: CallLogEntry[];
  onRefreshData: () => void;
}

type CategoryTab = 'all' | 'enquiries' | 'companies' | 'contacts' | 'products' | 'call_logs';

export const TrashBinModal: React.FC<TrashBinModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  enquiries,
  companies,
  contacts,
  products,
  callLogs,
  onRefreshData
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);

  if (!isOpen) return null;

  const isAdmin = currentUser?.role === 'Admin';

  // Extract soft-deleted items
  const deletedEnquiries = enquiries.filter((e) => e.is_deleted);
  const deletedCompanies = companies.filter((c) => c.is_deleted);
  const deletedContacts = contacts.filter((c) => c.is_deleted);
  const deletedProducts = products.filter((p) => p.is_deleted);
  const deletedCallLogs = callLogs.filter((l) => l.is_deleted);

  const totalDeletedCount =
    deletedEnquiries.length +
    deletedCompanies.length +
    deletedContacts.length +
    deletedProducts.length +
    deletedCallLogs.length;

  // Build unified items list
  interface UnifiedDeletedItem {
    id: string;
    type: 'enquiry' | 'company' | 'contact' | 'product' | 'call_log';
    typeLabel: string;
    title: string;
    subTitle?: string;
    deletedAt?: string;
    deletedByName?: string;
    rawItem: any;
  }

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
      items.push({
        id: p.id || '',
        type: 'product',
        typeLabel: 'Product',
        title: p.description,
        subTitle: p.product_type ? `Category: ${p.product_type}` : undefined,
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
      }
      onRefreshData();
    } catch (e) {
      console.error('Failed to restore item:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Purge Permanent
  const handlePurge = async (item: UnifiedDeletedItem) => {
    setIsProcessing(true);
    try {
      if (item.type === 'enquiry') {
        await EnquiryRepository.purgePermanent(item.id);
      } else if (item.type === 'company') {
        await CompanyRepository.purgeCompanyPermanent(item.id);
      } else if (item.type === 'contact') {
        await CompanyRepository.purgeContactPermanent(item.id);
      } else if (item.type === 'product') {
        await MetadataRepository.purgeProductPermanent(item.id);
      } else if (item.type === 'call_log') {
        await CallLogRepository.purgePermanent(item.id);
      }
      setConfirmPurgeId(null);
      onRefreshData();
    } catch (e) {
      console.error('Failed to purge item:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Empty Trash
  const handleEmptyTrash = async () => {
    setIsProcessing(true);
    try {
      for (const item of items) {
        if (item.type === 'enquiry') await EnquiryRepository.purgePermanent(item.id);
        else if (item.type === 'company') await CompanyRepository.purgeCompanyPermanent(item.id);
        else if (item.type === 'contact') await CompanyRepository.purgeContactPermanent(item.id);
        else if (item.type === 'product') await MetadataRepository.purgeProductPermanent(item.id);
        else if (item.type === 'call_log') await CallLogRepository.purgePermanent(item.id);
      }
      setShowEmptyTrashConfirm(false);
      onRefreshData();
    } catch (e) {
      console.error('Failed to empty trash:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Recycle Bin & Data Recovery</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  {totalDeletedCount} Items
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Safely inspect, restore, or permanently purge deleted workspace records.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && totalDeletedCount > 0 && (
              <button
                onClick={() => setShowEmptyTrashConfirm(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 text-xs font-medium bg-rose-600/20 text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-600/30 transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Empty Trash Bin
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar & Category Filters */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All', count: totalDeletedCount },
              { id: 'enquiries', label: 'Enquiries', count: deletedEnquiries.length },
              { id: 'companies', label: 'Companies', count: deletedCompanies.length },
              { id: 'contacts', label: 'Contacts', count: deletedContacts.length },
              { id: 'products', label: 'Products', count: deletedProducts.length },
              { id: 'call_logs', label: 'Call Logs', count: deletedCallLogs.length }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as CategoryTab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === tab.id ? 'bg-blue-700 text-blue-100' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deleted records..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Content Table / List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <CheckCircle2 className="w-12 h-12 text-slate-600 mb-3" />
              <h3 className="text-sm font-semibold text-slate-300">No Soft-Deleted Records Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
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
                  className="p-3.5 bg-slate-900/80 border border-slate-800/80 rounded-xl hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border mt-0.5 ${
                        item.type === 'enquiry'
                          ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                          : item.type === 'company'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : item.type === 'contact'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : item.type === 'product'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      }`}
                    >
                      {item.typeLabel}
                    </span>

                    <div>
                      <h4 className="text-xs font-semibold text-slate-200">{item.title}</h4>
                      {item.subTitle && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{item.subTitle}</p>}
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 mt-1">
                        {item.deletedAt && (
                          <span>Deleted: {new Date(item.deletedAt).toLocaleString()}</span>
                        )}
                        {item.deletedByName && <span>By: {item.deletedByName}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={isProcessing}
                      className="px-2.5 py-1 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>

                    {isAdmin && (
                      confirmPurgeId === item.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePurge(item)}
                            disabled={isProcessing}
                            className="px-2 py-1 text-[11px] font-semibold bg-rose-600 text-white rounded-md hover:bg-rose-500"
                          >
                            Confirm Purge
                          </button>
                          <button
                            onClick={() => setConfirmPurgeId(null)}
                            className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmPurgeId(item.id)}
                          disabled={isProcessing}
                          className="px-2 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Purge Permanently"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Empty Trash Confirmation Modal */}
        {showEmptyTrashConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 max-w-md w-full shadow-2xl">
              <div className="flex items-center gap-3 text-rose-400 mb-3">
                <AlertTriangle className="w-6 h-6" />
                <h3 className="text-sm font-bold text-slate-100">Permanently Empty Trash Bin?</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                This action will permanently delete all {totalDeletedCount} soft-deleted records from Firestore and local storage. This operation cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowEmptyTrashConfirm(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEmptyTrash}
                  disabled={isProcessing}
                  className="px-3 py-1.5 text-xs font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-500"
                >
                  Confirm Empty Trash
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <span>Soft-Delete Conflict Shield Active — Edits merge safely with queued records.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrashBinModal;
