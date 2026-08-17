import React, { useState } from 'react';
import { db, safeAddDoc, safeUpdateDoc, safeDeleteDoc } from '../firebase';
import { collection, writeBatch, doc } from 'firebase/firestore';
import { DropdownOption, Enquiry, Product, UserProfile, CallLogEntry, Company } from '../types';
import { ShieldCheck, Plus, Trash2, Edit2, Check, X, AlertTriangle, Info } from 'lucide-react';
import { CardPanel } from './layout/UiContainer';
import { SYSTEM_CALL_STATUSES, SYSTEM_CALL_OUTCOMES, SYSTEM_COMPANY_RELATIONSHIPS, SYSTEM_COMPANY_TEMPERATURES, normalizeOptionName } from '../utils/defaults';
import { isWorkspaceAdmin } from '../utils/permissions';

interface DropdownSettingsProps {
  enquirySources: DropdownOption[];
  productCategories: DropdownOption[];
  units: DropdownOption[];
  callStatuses?: DropdownOption[];
  callOutcomes?: DropdownOption[];
  companyRelationships?: DropdownOption[];
  companyTemperatures?: DropdownOption[];
  enquiries: Enquiry[];
  products: Product[];
  companies?: Company[];
  callLogs?: CallLogEntry[];
  user: UserProfile;
  activeWorkspaceId?: string;
  activeWorkspace?: any;
  setEnquirySources?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setUnits?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCallStatuses?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCallOutcomes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCompanyRelationships?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCompanyTemperatures?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
}

export default function DropdownSettingsManager({
  enquirySources = [],
  productCategories = [],
  units = [],
  callStatuses = [],
  callOutcomes = [],
  companyRelationships = [],
  companyTemperatures = [],
  enquiries = [],
  products = [],
  companies = [],
  callLogs = [],
  user,
  activeWorkspaceId,
  activeWorkspace,
  setEnquirySources,
  setProductCategories,
  setUnits,
  setCallStatuses,
  setCallOutcomes,
  setCompanyRelationships,
  setCompanyTemperatures,
  setEnquiries,
  setProducts,
  setCompanies,
  setCallLogs
}: DropdownSettingsProps) {
  const [activeSubTab, setActiveSubTab] = useState<'sources' | 'categories' | 'units' | 'statuses' | 'outcomes' | 'relationships' | 'temperatures'>('sources');
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionColor, setNewOptionColor] = useState('#64748b');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('#64748b');
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = isWorkspaceAdmin(user, activeWorkspaceId, activeWorkspace);

  const isSystemOption = (optionName: string, tab: 'sources' | 'categories' | 'units' | 'statuses' | 'outcomes' | 'relationships' | 'temperatures') => {
    const norm = normalizeOptionName(optionName);
    if (tab === 'statuses') {
      return SYSTEM_CALL_STATUSES.some(s => normalizeOptionName(s) === norm);
    }
    if (tab === 'outcomes') {
      return SYSTEM_CALL_OUTCOMES.some(o => normalizeOptionName(o) === norm);
    }
    if (tab === 'relationships') {
      return SYSTEM_COMPANY_RELATIONSHIPS.some(r => normalizeOptionName(r) === norm);
    }
    if (tab === 'temperatures') {
      return SYSTEM_COMPANY_TEMPERATURES.some(t => normalizeOptionName(t) === norm);
    }
    return false;
  };

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  // Validation/Checking helpers
  const getUsageCount = (optionName: string, type: 'sources' | 'categories' | 'units' | 'statuses' | 'outcomes' | 'relationships' | 'temperatures') => {
    if (type === 'sources') {
      return enquiries.filter(e => e.enquiry_source === optionName).length;
    } else if (type === 'categories') {
      const productUsage = products.filter(p => p.product_type === optionName).length;
      const enquiryUsage = enquiries.filter(e => 
        (e.line_items || []).some(li => li.product_type === optionName)
      ).length;
      return { products: productUsage, enquiries: enquiryUsage, total: productUsage + enquiryUsage };
    } else if (type === 'units') {
      const productUsage = products.filter(p => p.unit === optionName).length;
      const enquiryUsage = enquiries.filter(e => 
        (e.line_items || []).some(li => li.unit === optionName)
      ).length;
      return { products: productUsage, enquiries: enquiryUsage, total: productUsage + enquiryUsage };
    } else if (type === 'statuses') {
      return callLogs.filter(c => c.status === optionName).length;
    } else if (type === 'outcomes') {
      return callLogs.filter(c => c.outcome === optionName).length;
    } else if (type === 'relationships') {
      return companies.filter(c => c.relationship === optionName).length;
    } else {
      return companies.filter(c => c.temperature === optionName).length;
    }
  };

  const handleAddOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOptionName.trim()) return;

    const trimmed = newOptionName.trim();
    const collectionName = 
      activeSubTab === 'sources' ? 'dropdown_enquiry_sources' :
      activeSubTab === 'categories' ? 'dropdown_product_categories' : 
      activeSubTab === 'units' ? 'dropdown_units' :
      activeSubTab === 'statuses' ? 'dropdown_call_statuses' :
      activeSubTab === 'outcomes' ? 'dropdown_call_outcomes' :
      activeSubTab === 'relationships' ? 'dropdown_company_relationships' :
      'dropdown_company_temperatures';

    const currentList = 
      activeSubTab === 'sources' ? enquirySources :
      activeSubTab === 'categories' ? productCategories :
      activeSubTab === 'units' ? units :
      activeSubTab === 'statuses' ? callStatuses :
      activeSubTab === 'outcomes' ? callOutcomes :
      activeSubTab === 'relationships' ? companyRelationships :
      companyTemperatures;

    if (currentList.some(opt => opt.name.toLowerCase() === trimmed.toLowerCase())) {
      alert(`The option "${trimmed}" already exists.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await safeAddDoc(collectionName, { name: trimmed, color: newOptionColor });
      const newId = res?.id || ('opt_' + Date.now());
      const newOpt = { id: newId, name: trimmed, color: newOptionColor };

      if (activeSubTab === 'sources' && setEnquirySources) {
        setEnquirySources((prev) => [...prev, newOpt]);
      } else if (activeSubTab === 'categories' && setProductCategories) {
        setProductCategories((prev) => [...prev, newOpt]);
      } else if (activeSubTab === 'units' && setUnits) {
        setUnits((prev) => [...prev, newOpt]);
      } else if (activeSubTab === 'statuses' && setCallStatuses) {
        setCallStatuses((prev) => [...prev, newOpt]);
      } else if (activeSubTab === 'outcomes' && setCallOutcomes) {
        setCallOutcomes((prev) => [...prev, newOpt]);
      } else if (activeSubTab === 'relationships' && setCompanyRelationships) {
        setCompanyRelationships((prev) => [...prev, newOpt]);
      } else if (activeSubTab === 'temperatures' && setCompanyTemperatures) {
        setCompanyTemperatures((prev) => [...prev, newOpt]);
      }

      setNewOptionName('');
      setNewOptionColor('#64748b');
    } catch (err: any) {
      alert('Failed to add option: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (opt: DropdownOption) => {
    if (isSystemOption(opt.name, activeSubTab)) {
      setAlertDialog({
        isOpen: true,
        title: 'System Option',
        message: 'System default options are standard Omni Suite metadata definitions and cannot be edited or renamed.'
      });
      return;
    }
    setEditingId(opt.id);
    setEditingName(opt.name);
    setEditingColor(opt.color || '#64748b');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingColor('#64748b');
  };

  const handleSaveEdit = async (opt: DropdownOption) => {
    if (!editingName.trim()) return;
    const trimmedNewName = editingName.trim();
    const isNameChanged = trimmedNewName !== opt.name;
    const isColorChanged = editingColor !== opt.color;

    if (!isNameChanged && !isColorChanged) {
      setEditingId(null);
      return;
    }

    const collectionName = 
      activeSubTab === 'sources' ? 'dropdown_enquiry_sources' :
      activeSubTab === 'categories' ? 'dropdown_product_categories' : 
      activeSubTab === 'units' ? 'dropdown_units' :
      activeSubTab === 'statuses' ? 'dropdown_call_statuses' :
      activeSubTab === 'outcomes' ? 'dropdown_call_outcomes' :
      activeSubTab === 'relationships' ? 'dropdown_company_relationships' :
      'dropdown_company_temperatures';

    const currentList = 
      activeSubTab === 'sources' ? enquirySources :
      activeSubTab === 'categories' ? productCategories :
      activeSubTab === 'units' ? units :
      activeSubTab === 'statuses' ? callStatuses :
      activeSubTab === 'outcomes' ? callOutcomes :
      activeSubTab === 'relationships' ? companyRelationships :
      companyTemperatures;

    if (isNameChanged && currentList.some(o => o.id !== opt.id && o.name.toLowerCase() === trimmedNewName.toLowerCase())) {
      setAlertDialog({
        isOpen: true,
        title: 'Duplicate Option Name',
        message: `The option "${trimmedNewName}" already exists.`
      });
      return;
    }

    const executeSave = async () => {
      setSubmitting(true);
      try {
        const isQuota = typeof window !== 'undefined' && localStorage.getItem('omni_sim_firebase_quota') === 'true';
        const isOffline = typeof window !== 'undefined' && localStorage.getItem('omni_sim_offline_mode') === 'true';
        const isSimulationActive = isQuota || isOffline;

        let updateCount = 0;

        if (!isSimulationActive) {
          const batch = writeBatch(db);

          // 1. Update the option itself
          const optionRef = doc(db, collectionName, opt.id);
          batch.set(optionRef, { name: trimmedNewName, color: editingColor }, { merge: true });

          // 2. Cascade update referenced entries
          if (isNameChanged) {
            if (activeSubTab === 'sources') {
              const matchingEnquiries = enquiries.filter(e => e.enquiry_source === opt.name);
              matchingEnquiries.forEach(enq => {
                if (enq.id) {
                  const ref = doc(db, 'enquiries', enq.id);
                  batch.update(ref, { enquiry_source: trimmedNewName });
                  updateCount++;
                }
              });
            } else if (activeSubTab === 'categories') {
              // Products
              const matchingProducts = products.filter(p => p.product_type === opt.name);
              matchingProducts.forEach(p => {
                if (p.id) {
                  const ref = doc(db, 'products', p.id);
                  batch.update(ref, { product_type: trimmedNewName });
                  updateCount++;
                }
              });

              // Enquiries (LineItems array)
              const matchingEnquiries = enquiries.filter(e => 
                (e.line_items || []).some(li => li.product_type === opt.name)
              );
              matchingEnquiries.forEach(enq => {
                if (enq.id) {
                  const updatedItems = enq.line_items.map(li => 
                    li.product_type === opt.name ? { ...li, product_type: trimmedNewName } : li
                  );
                  const ref = doc(db, 'enquiries', enq.id);
                  batch.update(ref, { line_items: updatedItems });
                  updateCount++;
                }
              });
            } else if (activeSubTab === 'units') {
              // Products
              const matchingProducts = products.filter(p => p.unit === opt.name);
              matchingProducts.forEach(p => {
                if (p.id) {
                  const ref = doc(db, 'products', p.id);
                  batch.update(ref, { unit: trimmedNewName });
                  updateCount++;
                }
              });

              // Enquiries (LineItems array)
              const matchingEnquiries = enquiries.filter(e => 
                (e.line_items || []).some(li => li.unit === opt.name)
              );
              matchingEnquiries.forEach(enq => {
                if (enq.id) {
                  const updatedItems = enq.line_items.map(li => 
                    li.unit === opt.name ? { ...li, unit: trimmedNewName } : li
                  );
                  const ref = doc(db, 'enquiries', enq.id);
                  batch.update(ref, { line_items: updatedItems });
                  updateCount++;
                }
              });
            } else if (activeSubTab === 'statuses') {
              const matchingCallLogs = callLogs.filter(c => c.status === opt.name);
              matchingCallLogs.forEach(c => {
                if (c.id) {
                  const ref = doc(db, 'call_logs', c.id);
                  batch.update(ref, { status: trimmedNewName });
                  updateCount++;
                }
              });
            } else if (activeSubTab === 'outcomes') {
              const matchingCallLogs = callLogs.filter(c => c.outcome === opt.name);
              matchingCallLogs.forEach(c => {
                if (c.id) {
                  const ref = doc(db, 'call_logs', c.id);
                  batch.update(ref, { outcome: trimmedNewName });
                  updateCount++;
                }
              });
            } else if (activeSubTab === 'relationships') {
              const matchingCompanies = companies.filter(c => c.relationship === opt.name);
              matchingCompanies.forEach(c => {
                if (c.id) {
                  const ref = doc(db, 'companies', c.id);
                  batch.update(ref, { relationship: trimmedNewName });
                  updateCount++;
                }
              });
            } else if (activeSubTab === 'temperatures') {
              const matchingCompanies = companies.filter(c => c.temperature === opt.name);
              matchingCompanies.forEach(c => {
                if (c.id) {
                  const ref = doc(db, 'companies', c.id);
                  batch.update(ref, { temperature: trimmedNewName });
                  updateCount++;
                }
              });
            }
          }

          await batch.commit();
        } else {
          // Calculate simulated updates
          if (isNameChanged) {
            if (activeSubTab === 'sources') {
              updateCount = enquiries.filter(e => e.enquiry_source === opt.name).length;
            } else if (activeSubTab === 'categories') {
              updateCount = products.filter(p => p.product_type === opt.name).length + enquiries.filter(e => (e.line_items || []).some(li => li.product_type === opt.name)).length;
            } else if (activeSubTab === 'units') {
              updateCount = products.filter(p => p.unit === opt.name).length + enquiries.filter(e => (e.line_items || []).some(li => li.unit === opt.name)).length;
            } else if (activeSubTab === 'statuses') {
              updateCount = callLogs.filter(c => c.status === opt.name).length;
            } else if (activeSubTab === 'outcomes') {
              updateCount = callLogs.filter(c => c.outcome === opt.name).length;
            } else if (activeSubTab === 'relationships') {
              updateCount = companies.filter(c => c.relationship === opt.name).length;
            } else if (activeSubTab === 'temperatures') {
              updateCount = companies.filter(c => c.temperature === opt.name).length;
            }
          }
          console.warn(`[SIMULATION] Dropdown update committed locally. Affected ${updateCount} records.`);
        }

        // Update local state instantly
        if (activeSubTab === 'sources' && setEnquirySources) {
          setEnquirySources((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setEnquiries) {
            setEnquiries((prev) =>
              prev.map((e) => (e.enquiry_source === opt.name ? { ...e, enquiry_source: trimmedNewName } : e))
            );
          }
        } else if (activeSubTab === 'categories' && setProductCategories) {
          setProductCategories((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setProducts) {
            setProducts((prev) =>
              prev.map((p) => (p.product_type === opt.name ? { ...p, product_type: trimmedNewName } : p))
            );
          }
          if (setEnquiries) {
            setEnquiries((prev) =>
              prev.map((e) => ({
                ...e,
                line_items: (e.line_items || []).map((li) =>
                  li.product_type === opt.name ? { ...li, product_type: trimmedNewName } : li
                )
              }))
            );
          }
        } else if (activeSubTab === 'units' && setUnits) {
          setUnits((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setProducts) {
            setProducts((prev) =>
              prev.map((p) => (p.unit === opt.name ? { ...p, unit: trimmedNewName } : p))
            );
          }
          if (setEnquiries) {
            setEnquiries((prev) =>
              prev.map((e) => ({
                ...e,
                line_items: (e.line_items || []).map((li) =>
                  li.unit === opt.name ? { ...li, unit: trimmedNewName } : li
                )
              }))
            );
          }
        } else if (activeSubTab === 'statuses' && setCallStatuses) {
          setCallStatuses((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setCallLogs) {
            setCallLogs((prev) =>
              prev.map((c) => (c.status === opt.name ? { ...c, status: trimmedNewName } : c))
            );
          }
        } else if (activeSubTab === 'outcomes' && setCallOutcomes) {
          setCallOutcomes((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setCallLogs) {
            setCallLogs((prev) =>
              prev.map((c) => (c.outcome === opt.name ? { ...c, outcome: trimmedNewName } : c))
            );
          }
        } else if (activeSubTab === 'relationships' && setCompanyRelationships) {
          setCompanyRelationships((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setCompanies) {
            setCompanies((prev) =>
              prev.map((c) => (c.relationship === opt.name ? { ...c, relationship: trimmedNewName } : c))
            );
          }
        } else if (activeSubTab === 'temperatures' && setCompanyTemperatures) {
          setCompanyTemperatures((prev) => prev.map((o) => (o.id === opt.id ? { ...o, name: trimmedNewName, color: editingColor } : o)));
          if (setCompanies) {
            setCompanies((prev) =>
              prev.map((c) => (c.temperature === opt.name ? { ...c, temperature: trimmedNewName } : c))
            );
          }
        }

        setEditingId(null);
        setAlertDialog({
          isOpen: true,
          title: 'Update Successful',
          message: `Success! Updated option name and successfully migrated ${updateCount} referencing records.`
        });
      } catch (err: any) {
        setAlertDialog({
          isOpen: true,
          title: 'Update Failed',
          message: 'Failed to rename option: ' + err.message
        });
      } finally {
        setSubmitting(false);
      }
    };

    if (isNameChanged) {
      setConfirmDialog({
        isOpen: true,
        title: 'Confirm Option Rename',
        message: `Are you sure you want to rename "${opt.name}" to "${trimmedNewName}"?\nThis will automatically search and update all active database records referencing it.`,
        confirmText: 'Rename Option',
        onConfirm: () => {
          executeSave();
        }
      });
    } else {
      executeSave();
    }
  };

  const handleDeleteOption = async (opt: DropdownOption) => {
    if (isSystemOption(opt.name, activeSubTab)) {
      setAlertDialog({
        isOpen: true,
        title: 'System Option',
        message: 'System default options are standard Omni Suite metadata definitions and cannot be deleted.'
      });
      return;
    }
    const usage = getUsageCount(opt.name, activeSubTab);
    const hasUsage = typeof usage === 'number' ? usage > 0 : usage.total > 0;

    if (hasUsage) {
      let usageDetails = '';
      if (typeof usage === 'number') {
        usageDetails = activeSubTab === 'statuses' || activeSubTab === 'outcomes'
          ? `${usage} Call Log record(s)`
          : `${usage} Enquiry record(s)`;
      } else {
        usageDetails = `${usage.products} Product(s) and ${usage.enquiries} Enquiry line item(s)`;
      }
      setAlertDialog({
        isOpen: true,
        title: 'Deletion Blocked',
        message: `Cannot delete option "${opt.name}" because it is currently in use by ${usageDetails}.\n\nPlease edit those active records first or migrate them to a different option before deleting.`
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Confirm Option Deletion',
      message: `Are you sure you want to delete the option "${opt.name}"? This action cannot be undone.`,
      confirmText: 'Delete Option',
      isDestructive: true,
      onConfirm: async () => {
        setSubmitting(true);
        try {
          const collectionName = 
            activeSubTab === 'sources' ? 'dropdown_enquiry_sources' :
            activeSubTab === 'categories' ? 'dropdown_product_categories' : 
            activeSubTab === 'units' ? 'dropdown_units' :
            activeSubTab === 'statuses' ? 'dropdown_call_statuses' :
            activeSubTab === 'outcomes' ? 'dropdown_call_outcomes' :
            activeSubTab === 'relationships' ? 'dropdown_company_relationships' :
            'dropdown_company_temperatures';

          await safeDeleteDoc(collectionName, opt.id);

          if (activeSubTab === 'sources' && setEnquirySources) {
            setEnquirySources((prev) => prev.filter((o) => o.id !== opt.id));
          } else if (activeSubTab === 'categories' && setProductCategories) {
            setProductCategories((prev) => prev.filter((o) => o.id !== opt.id));
          } else if (activeSubTab === 'units' && setUnits) {
            setUnits((prev) => prev.filter((o) => o.id !== opt.id));
          } else if (activeSubTab === 'statuses' && setCallStatuses) {
            setCallStatuses((prev) => prev.filter((o) => o.id !== opt.id));
          } else if (activeSubTab === 'outcomes' && setCallOutcomes) {
            setCallOutcomes((prev) => prev.filter((o) => o.id !== opt.id));
          } else if (activeSubTab === 'relationships' && setCompanyRelationships) {
            setCompanyRelationships((prev) => prev.filter((o) => o.id !== opt.id));
          } else if (activeSubTab === 'temperatures' && setCompanyTemperatures) {
            setCompanyTemperatures((prev) => prev.filter((o) => o.id !== opt.id));
          }
        } catch (err: any) {
          setAlertDialog({
            isOpen: true,
            title: 'Deletion Failed',
            message: 'Failed to delete option: ' + err.message
          });
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

  const activeList = 
    activeSubTab === 'sources' ? enquirySources :
    activeSubTab === 'categories' ? productCategories :
    activeSubTab === 'units' ? units :
    activeSubTab === 'statuses' ? callStatuses :
    activeSubTab === 'outcomes' ? callOutcomes :
    activeSubTab === 'relationships' ? companyRelationships :
    companyTemperatures;

  const getSubTabLabel = () => {
    if (activeSubTab === 'sources') return 'Enquiry Sources';
    if (activeSubTab === 'categories') return 'Product Categories';
    if (activeSubTab === 'units') return 'Standard Measurement Units';
    if (activeSubTab === 'statuses') return 'Call Statuses';
    if (activeSubTab === 'outcomes') return 'Call Outcomes';
    if (activeSubTab === 'relationships') return 'Company Relationships';
    return 'Company Priority Temperatures';
  };

  const getSubTabDescription = () => {
    if (activeSubTab === 'sources') return 'Manage incoming inquiry channels (e.g. Email, Phone, WhatsApp).';
    if (activeSubTab === 'categories') return 'Manage item classification types used to group standard catalog and proposal products.';
    if (activeSubTab === 'units') return 'Manage valid unit quantities available for proposal line items (e.g. Nos, M3, Kg).';
    if (activeSubTab === 'statuses') return 'Manage call schedule lifecycle statuses (e.g. Scheduled, Completed, Cancelled, Follow-Up Required).';
    if (activeSubTab === 'outcomes') return 'Manage 1-click outcome preset chips and result classifications logged by operators.';
    if (activeSubTab === 'relationships') return 'Manage strategic business classification (e.g. Prospect, Active Customer, Former Customer, Partner / Reseller, Vendor / Supplier, Competitor).';
    return 'Manage company priority heat levels (e.g. Hot, Warm, Cold).';
  };

  return (
    <div id="dropdown-settings-container" className="space-y-6">
      {/* Title block */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-sans tracking-tight">Dropdown Metadata Settings</h1>
          <p className="text-xs text-slate-500 font-sans mt-1">
            Configure, expand, and sanitize dropdown menu selection values across Enquiries, Companies, and Call Operations.
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-200 text-xs font-mono font-bold uppercase">
          <ShieldCheck className="w-4 h-4" />
          <span>Operator Mode</span>
        </div>
      </div>

      {/* Sub Tabs Bar */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {(['sources', 'categories', 'units', 'statuses', 'outcomes', 'relationships', 'temperatures'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveSubTab(tab);
              setNewOptionName('');
              handleCancelEdit();
            }}
            className={`py-3 px-5 text-xs font-semibold uppercase tracking-wider font-sans border-b-2 transition -mb-[2px] shrink-0 ${
              activeSubTab === tab
                ? 'border-blue-600 text-blue-600 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab === 'sources' ? 'Enquiry Sources' :
             tab === 'categories' ? 'Product Categories' :
             tab === 'units' ? 'Units' :
             tab === 'statuses' ? 'Call Statuses' :
             tab === 'outcomes' ? 'Call Outcomes' :
             tab === 'relationships' ? 'Relationships' : 'Temperatures'}
          </button>
        ))}
      </div>

      {/* Context info banner */}
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-amber-800">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="font-sans space-y-1">
            <span className="font-bold text-amber-900 block">Read-Only View (Admin Access Required)</span>
            <p>Only Workspace Administrators can add, edit, or delete dropdown registry values. Please contact an Administrator to request new dropdown metadata options.</p>
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start space-x-3 text-xs text-slate-600">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="font-sans space-y-1">
          <span className="font-bold text-slate-800 block">{getSubTabLabel()} Settings</span>
          <p>{getSubTabDescription()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Column: List of items */}
        <div className="space-y-4">
          <h3 className="text-xs font-mono text-slate-400 uppercase tracking-widest block">Active Values ({activeList.length})</h3>
          
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 shadow-sm">
            {activeList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-sans text-xs italic">
                No custom options initialized.
              </div>
            ) : (
              activeList.map((opt) => {
                const usage = getUsageCount(opt.name, activeSubTab);
                const hasUsage = typeof usage === 'number' ? usage > 0 : usage.total > 0;
                const isEditing = editingId === opt.id;
                const isSystem = isSystemOption(opt.name, activeSubTab);

                return (
                  <div key={opt.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex-1 mr-4">
                      {isEditing ? (
                        <div className="flex flex-col space-y-2 w-full p-2 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-mono focus:outline-none flex-1"
                              placeholder="Enter option name"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveEdit(opt)}
                              disabled={submitting}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-lg transition shrink-0"
                              title="Save"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              disabled={submitting}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded-lg transition shrink-0"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="flex items-center space-x-2 pt-1 border-t border-slate-200">
                            <span className="text-[10px] text-slate-400 font-mono">Custom Color:</span>
                            <input
                              type="color"
                              value={editingColor}
                              onChange={(e) => setEditingColor(e.target.value)}
                              className="w-6 h-6 rounded cursor-pointer border border-slate-300 p-0"
                            />
                            <div className="flex flex-wrap gap-1">
                              {['#10b981', '#3b82f6', '#6366f1', '#f59e0b', '#f43f5e', '#64748b', '#8b5cf6'].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => setEditingColor(preset)}
                                  className={`w-4 h-4 rounded-full border transition ${
                                    editingColor === preset ? 'ring-1 ring-blue-500 scale-110 border-white' : 'border-slate-300'
                                  }`}
                                  style={{ backgroundColor: preset }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            {opt.color && (
                              <span 
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-slate-300/60"
                                style={{ backgroundColor: opt.color }}
                              />
                            )}
                            <span className="text-xs text-slate-800 font-mono font-bold block">{opt.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono block pl-4.5">
                            Used by: {typeof usage === 'number' 
                              ? `${usage} record(s)` 
                              : `${usage.products} Product(s), ${usage.enquiries} Line item(s)`}
                          </span>
                        </div>
                      )}
                    </div>

                    {!isEditing && (
                      <div className="flex items-center space-x-1 shrink-0">
                        {isSystem ? (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200/50 px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">
                            System Default
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartEdit(opt)}
                              disabled={submitting || user.role === 'Viewer'}
                              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition disabled:opacity-30"
                              title="Rename"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteOption(opt)}
                              disabled={submitting || user.role === 'Viewer'}
                              className={`p-1.5 rounded-lg transition disabled:opacity-30 ${
                                hasUsage 
                                  ? 'text-slate-300 hover:text-amber-500 hover:bg-amber-50' 
                                  : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                              }`}
                              title={hasUsage ? 'Used in records (cannot delete)' : 'Delete Option'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Add Option */}
        {user.role !== 'Viewer' && (
          <div className="space-y-4">
            <h3 className="text-xs font-mono text-slate-400 uppercase tracking-widest block">Add New Value</h3>
            
            <form onSubmit={handleAddOption} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                  Option Name *
                </label>
                <input
                  type="text"
                  required
                  disabled={!isAdmin}
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  placeholder={isAdmin ? `e.g. ${activeSubTab === 'sources' ? 'LinkedIn' : activeSubTab === 'categories' ? 'Agitators' : 'Ltrs'}` : 'Admin access required'}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500/20 font-mono disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  Appearance / Accent Color
                </label>
                <div className="flex items-center space-x-3 bg-slate-50 border border-slate-150 p-2.5 rounded-xl">
                  <input
                    type="color"
                    disabled={!isAdmin}
                    value={newOptionColor}
                    onChange={(e) => setNewOptionColor(e.target.value)}
                    className="w-8 h-8 rounded-lg cursor-pointer border border-slate-300 p-0 shrink-0 bg-transparent disabled:opacity-50"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {['#10b981', '#3b82f6', '#6366f1', '#f59e0b', '#f43f5e', '#64748b', '#8b5cf6'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        disabled={!isAdmin}
                        onClick={() => setNewOptionColor(preset)}
                        className={`w-6 h-6 rounded-full border transition flex items-center justify-center ${
                          newOptionColor === preset ? 'ring-2 ring-blue-500 scale-110 border-white' : 'border-slate-300'
                        } disabled:opacity-50`}
                        style={{ backgroundColor: preset }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={!isAdmin || submitting || !newOptionName.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition shadow-sm flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isAdmin ? 'Add Option' : 'Admin Only'}</span>
              </button>
            </form>

            {/* Constraints Card */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-2.5 text-[11px] text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="font-sans space-y-1">
                <span className="font-bold text-amber-900 block font-mono text-[10px] uppercase tracking-wider">Referential Safety Rules:</span>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  <li>Renaming an option cascade updates all active records in real-time.</li>
                  <li>Deleting an option is blocked if it is actively linked to any products or enquiries.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reusable Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-6 whitespace-pre-wrap">{confirmDialog.message}</p>
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

      {/* Reusable Alert Dialog Overlay */}
      {alertDialog.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{alertDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-6 whitespace-pre-wrap">{alertDialog.message}</p>
            <div className="flex items-center justify-end font-sans">
              <button
                type="button"
                onClick={() => setAlertDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-5 bg-slate-900 hover:bg-slate-800 rounded-xl text-xs font-semibold text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
