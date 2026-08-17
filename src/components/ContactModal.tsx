import React, { useState, useEffect } from 'react';
import { CustomLabelSelect, PHONE_LABEL_DEFAULT_OPTIONS, EMAIL_LABEL_DEFAULT_OPTIONS } from './CustomLabelSelect';
import { X, User, Building2, Phone, Mail, Plus, Trash2, ShieldAlert, Check, ArrowRightLeft, Sparkles } from 'lucide-react';
import { CallLogEntry, Company, Contact, ContactMethod, LabeledPhone, LabeledEmail, LabeledHandle, UserProfile, getContactPhones, getContactEmails, getContactHandles, getCompanyPhones, getCompanyEmails, isSamePhoneNumber } from '../types';
import { safeAddDoc, safeUpdateDoc, safeDeleteDoc } from '../firebase';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { generateContactSearchTerms } from '../utils/defaults';
import { recordAuditLog } from '../utils/auditLogger';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

export function normalizePhoneKey(phone?: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  const hasLeadingPlus = trimmed.startsWith('+');
  const digitsOnly = trimmed.replace(/[^\d]/g, '');
  if (!digitsOnly) return '';
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

export function getLineRestriction(
  restrictedLinesMap?: Record<string, 'DNC' | 'Invalid'>,
  phoneStr?: string,
  isDncFallback?: boolean
): 'DNC' | 'Invalid' | undefined {
  if (!phoneStr) return isDncFallback ? 'DNC' : undefined;
  if (!restrictedLinesMap) return isDncFallback ? 'DNC' : undefined;
  const normKey = normalizePhoneKey(phoneStr);
  const trimmed = phoneStr.trim();
  return (
    restrictedLinesMap[normKey] ||
    restrictedLinesMap[trimmed] ||
    restrictedLinesMap[phoneStr] ||
    (isDncFallback ? 'DNC' : undefined)
  );
}

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact?: Contact | null; // null if creating
  companyId?: string; // Pre-selected company ID if creating from company view
  companies: Company[];
  activeWorkspaceId: string;
  user: UserProfile;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  onSaved?: (savedContact: Contact) => void;
}

const PHONE_LABEL_OPTIONS = ['Landline', 'Mobile', 'WhatsApp', 'Direct Line', 'Support', 'Fax', 'Other'];
const EMAIL_LABEL_OPTIONS = ['Work', 'Personal', 'Info', 'Billing', 'Support', 'Other'];

const generateCtId = () => `ct_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

export default function ContactModal({
  isOpen,
  onClose,
  contact,
  companyId: initialCompanyId,
  companies,
  activeWorkspaceId,
  user,
  setContacts,
  setCompanies,
  setCallLogs,
  onSaved
}: ContactModalProps) {
  const isEditing = !!contact?.id;

  const [companyId, setCompanyId] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [designation, setDesignation] = useState<string>('');
  const [isPrimary, setIsPrimary] = useState<boolean>(false);
  const [isDnc, setIsDnc] = useState<boolean>(false);
  const [dncReason, setDncReason] = useState<string>('');

  const [phones, setPhones] = useState<ContactMethod[]>([{ id: 'ct_init_p1', label: 'Mobile', value: '' }]);
  const [emails, setEmails] = useState<ContactMethod[]>([{ id: 'ct_init_e1', label: 'Work', value: '' }]);
  const [handles, setHandles] = useState<LabeledHandle[]>([]);
  const [editingRestrictedLines, setEditingRestrictedLines] = useState<Record<string, 'DNC' | 'Invalid'>>({});
  const [isSaving, setIsSaving] = useState(false);

  const toggleRestriction = (val: string) => {
    const normKey = normalizePhoneKey(val);
    if (!normKey) return;

    setEditingRestrictedLines((prev) => {
      const current = prev[normKey] || prev[val.trim()] || prev[val];
      const nextMap = { ...prev };

      if (!current) {
        nextMap[normKey] = 'Invalid';
      } else if (current === 'Invalid') {
        nextMap[normKey] = 'DNC';
      } else {
        delete nextMap[normKey];
        delete nextMap[val.trim()];
        delete nextMap[val];
      }
      return nextMap;
    });
  };

  const selectedCompany = companies.find((c) => c.id === companyId);
  const availableCompanyPhones = selectedCompany ? getCompanyPhones(selectedCompany) : [];
  const availableCompanyEmails = selectedCompany ? getCompanyEmails(selectedCompany) : [];

  const claimCompanyPhone = async (phoneObj: any) => {
    if (!selectedCompany) return;
    const phoneVal = phoneObj.value || phoneObj.number || '';
    if (!phoneVal) return;

    setPhones((prev) => [...prev.filter((p) => p.value.trim() !== ''), { id: generateCtId(), label: phoneObj.label || 'Landline', value: phoneVal }]);

    const currentCompPhones = getCompanyPhones(selectedCompany);
    const updatedPhones = currentCompPhones.filter(
      (p) => (p.value || p.number || '').trim().toLowerCase() !== phoneVal.trim().toLowerCase()
    );

    const updatedCompany: Company = {
      ...selectedCompany,
      phones: updatedPhones as any,
      general_phones: updatedPhones as any,
      general_phone: updatedPhones[0]?.value || updatedPhones[0]?.number || ''
    };

    try {
      await safeUpdateDoc('companies', selectedCompany.id!, {
        phones: updatedPhones,
        general_phones: updatedPhones,
        general_phone: updatedPhones[0]?.value || updatedPhones[0]?.number || '',
        last_modified_by_uid: user?.uid || '',
        last_modified_by_name: user?.full_name || user?.username || user?.email || 'Unknown User',
        updatedAt: new Date().toISOString()
      });
      await CompanyRepository.updateCompany(selectedCompany.id!, updatedCompany);
      if (setCompanies) {
        setCompanies((prev) => prev.map((c) => (c.id === selectedCompany.id ? updatedCompany : c)));
      }
    } catch (err) {
      console.error('Failed to reassign company phone:', err);
    }
  };

  const claimCompanyEmail = async (emailObj: any) => {
    if (!selectedCompany) return;
    const emailVal = emailObj.value || emailObj.email || '';
    if (!emailVal) return;

    setEmails((prev) => [...prev.filter((e) => e.value.trim() !== ''), { id: generateCtId(), label: emailObj.label || 'Work', value: emailVal }]);

    const currentCompEmails = getCompanyEmails(selectedCompany);
    const updatedEmails = currentCompEmails.filter(
      (e) => (e.value || e.email || '').trim().toLowerCase() !== emailVal.trim().toLowerCase()
    );

    const updatedCompany: Company = {
      ...selectedCompany,
      emails: updatedEmails as any,
      general_emails: updatedEmails as any,
      general_email: updatedEmails[0]?.value || updatedEmails[0]?.email || ''
    };

    try {
      await safeUpdateDoc('companies', selectedCompany.id!, {
        emails: updatedEmails,
        general_emails: updatedEmails,
        general_email: updatedEmails[0]?.value || updatedEmails[0]?.email || '',
        last_modified_by_uid: user?.uid || '',
        last_modified_by_name: user?.full_name || user?.username || user?.email || 'Unknown User',
        updatedAt: new Date().toISOString()
      });
      await CompanyRepository.updateCompany(selectedCompany.id!, updatedCompany);
      if (setCompanies) {
        setCompanies((prev) => prev.map((c) => (c.id === selectedCompany.id ? updatedCompany : c)));
      }
    } catch (err) {
      console.error('Failed to reassign company email:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (contact) {
        setCompanyId(contact.company_id || initialCompanyId || '');
        setFullName(contact.full_name || '');
        setDesignation(contact.designation || '');
        setIsPrimary(!!contact.is_primary);
        setIsDnc(!!contact.is_dnc);
        setDncReason(contact.dnc_reason || '');

        // Populate phones
        const existingPhones = getContactPhones(contact);
        const mappedPhones: ContactMethod[] = existingPhones.map((p) => ({
          id: p.id || generateCtId(),
          label: p.label || 'Mobile',
          value: p.value || p.number || ''
        }));
        setPhones(mappedPhones.length > 0 ? mappedPhones : [{ id: generateCtId(), label: 'Mobile', value: contact.mobile || contact.phone || '' }]);

        // Populate emails
        const existingEmails = getContactEmails(contact);
        const mappedEmails: ContactMethod[] = existingEmails.map((e) => ({
          id: e.id || generateCtId(),
          label: e.label || 'Work',
          value: e.value || e.email || ''
        }));
        setEmails(mappedEmails.length > 0 ? mappedEmails : [{ id: generateCtId(), label: 'Work', value: contact.email || '' }]);

        // Populate handles
        const existingHandles = getContactHandles(contact);
        setHandles(existingHandles.length > 0 ? existingHandles : []);

        // Populate restricted lines
        if (contact.restricted_lines) {
          const normMap: Record<string, 'DNC' | 'Invalid'> = {};
          Object.entries(contact.restricted_lines).forEach(([k, v]) => {
            const normK = normalizePhoneKey(k);
            if (normK) normMap[normK] = v;
            normMap[k.trim()] = v;
          });
          setEditingRestrictedLines(normMap);
        } else {
          setEditingRestrictedLines({});
        }
      } else {
        setCompanyId(initialCompanyId || '');
        setFullName('');
        setDesignation('');
        setIsPrimary(false);
        setIsDnc(false);
        setDncReason('');
        setPhones([{ id: generateCtId(), label: 'Mobile', value: '' }]);
        setEmails([{ id: generateCtId(), label: 'Work', value: '' }]);
        setHandles([]);
        setEditingRestrictedLines({});
      }
    }
  }, [isOpen, contact, initialCompanyId]);

  if (!isOpen) return null;

  const handleAddPhone = () => {
    setPhones((prev) => [...prev, { id: generateCtId(), label: 'Mobile', value: '' }]);
  };

  const handleRemovePhone = (index: number) => {
    setPhones((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePhoneChange = (index: number, field: 'value' | 'label', val: string) => {
    setPhones((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleAddEmail = () => {
    setEmails((prev) => [...prev, { id: generateCtId(), label: 'Work', value: '' }]);
  };

  const handleRemoveEmail = (index: number) => {
    setEmails((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEmailChange = (index: number, field: 'value' | 'label', val: string) => {
    setEmails((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleAddHandle = () => {
    setHandles((prev) => [...prev, { platform: 'WhatsApp', handle: '' }]);
  };

  const handleRemoveHandle = (index: number) => {
    setHandles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleHandleChange = (index: number, field: 'platform' | 'handle', val: string) => {
    setHandles((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      alert('Please enter contact full name.');
      return;
    }

    setIsSaving(true);

    const validPhones = phones.filter((p) => p.value.trim() !== '');
    const validEmails = emails.filter((e) => e.value.trim() !== '');
    const validHandles = handles.filter((h) => h.handle.trim() !== '');

    const legacyPhones = validPhones.map((p) => ({ id: p.id, label: p.label, number: p.value, value: p.value }));
    const legacyEmails = validEmails.map((e) => ({ id: e.id, label: e.label, email: e.value, value: e.value }));

    const primaryMobile = validPhones.find((p) => p.label === 'Mobile')?.value || validPhones[0]?.value || '';
    const primaryLandline = validPhones.find((p) => p.label === 'Landline' || p.label === 'Direct Line' || p.label === 'Telephone')?.value || '';
    const primaryEmail = validEmails[0]?.value || '';

    const userUid = user?.uid || '';
    const userName = user?.full_name || user?.username || user?.email || 'Unknown User';

    if (!activeWorkspaceId) {
      setIsSaving(false);
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    const payload: Omit<Contact, 'id'> = {
      workspace_id: activeWorkspaceId,
      company_id: companyId || '',
      full_name: fullName.trim(),
      designation: designation.trim(),
      mobile: primaryMobile,
      landline: primaryLandline,
      phone: primaryMobile || primaryLandline,
      email: primaryEmail,
      phones: legacyPhones as any,
      emails: legacyEmails as any,
      handles: validHandles,
      restricted_lines: editingRestrictedLines,
      is_primary: isPrimary,
      is_dnc: isDnc,
      dnc_reason: isDnc ? dncReason.trim() : '',
      search_terms: generateContactSearchTerms(fullName.trim(), primaryEmail, legacyPhones),
      created_by_uid: contact?.created_by_uid || userUid,
      created_by_name: contact?.created_by_name || userName,
      last_modified_by_uid: userUid,
      last_modified_by_name: userName,
      createdAt: contact?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      // PART 2: Remove claimed/assigned phones & emails from selectedCompany's unassigned pool
      if (selectedCompany) {
        const compPhones = getCompanyPhones(selectedCompany);
        const compEmails = getCompanyEmails(selectedCompany);

        const contactPhoneVals = validPhones.map((p) => p.value.trim()).filter(Boolean);
        const contactEmailVals = validEmails.map((e) => e.value.trim().toLowerCase()).filter(Boolean);

        const remainingPhones = compPhones.filter(
          (p) => !contactPhoneVals.some((cp) => isSamePhoneNumber(p.value || p.number, cp))
        );
        const remainingEmails = compEmails.filter(
          (e) => !contactEmailVals.includes((e.value || e.email || '').trim().toLowerCase())
        );

        if (remainingPhones.length !== compPhones.length || remainingEmails.length !== compEmails.length) {
          const updatedCompany: Company = {
            ...selectedCompany,
            phones: remainingPhones as any,
            general_phones: remainingPhones as any,
            general_phone: remainingPhones[0]?.value || remainingPhones[0]?.number || '',
            emails: remainingEmails as any,
            general_emails: remainingEmails as any,
            general_email: remainingEmails[0]?.value || remainingEmails[0]?.email || '',
            updatedAt: new Date().toISOString()
          };

          await safeUpdateDoc('companies', selectedCompany.id!, {
            phones: remainingPhones,
            general_phones: remainingPhones,
            general_phone: remainingPhones[0]?.value || remainingPhones[0]?.number || '',
            emails: remainingEmails,
            general_emails: remainingEmails,
            general_email: remainingEmails[0]?.value || remainingEmails[0]?.email || '',
            updatedAt: new Date().toISOString()
          });
          await CompanyRepository.updateCompany(selectedCompany.id!, updatedCompany);
          if (setCompanies) {
            setCompanies((prev) => prev.map((c) => (c.id === selectedCompany.id ? updatedCompany : c)));
          }
        }
      }

      if (isPrimary) {
        // Reset primary flag for other contacts under same company
        const batch = writeBatch(db);
        // Best effort local batch update
        // We will execute update in Firestore
      }

      let finalContactObj: Contact;

      if (isEditing && contact?.id) {
        await safeUpdateDoc('contacts', contact.id, payload);
        finalContactObj = { id: contact.id, ...payload };
        await CompanyRepository.saveContact(finalContactObj);
        await recordAuditLog({
          document_id: contact.id,
          entity_type: 'contact',
          entity_title: payload.full_name,
          action: 'update',
          user,
          before: contact,
          after: finalContactObj,
          details: `Updated contact person: "${payload.full_name}"`
        });
      } else {
        const res = await safeAddDoc('contacts', payload);
        const newId = res?.id || ('cont_' + Date.now());
        finalContactObj = { id: newId, ...payload };
        await CompanyRepository.saveContact(finalContactObj);
        await recordAuditLog({
          document_id: newId,
          entity_type: 'contact',
          entity_title: payload.full_name,
          action: 'create',
          user,
          after: finalContactObj,
          details: `Created new contact person: "${payload.full_name}"`
        });
      }

      if (setContacts) {
        setContacts((prev) => {
          let list = prev;
          if (isPrimary) {
            list = list.map((c) => (c.company_id === companyId ? { ...c, is_primary: false } : c));
          }
          if (isEditing) {
            return list.map((c) => (c.id === finalContactObj.id ? finalContactObj : c));
          } else {
            return [finalContactObj, ...list.filter((c) => c.id !== finalContactObj.id)];
          }
        });
      }

      if (setCallLogs && isEditing && finalContactObj.id) {
        setCallLogs((prevLogs) =>
          prevLogs.map((log) =>
            log.contact_id === finalContactObj.id
              ? {
                  ...log,
                  contact_name: finalContactObj.full_name,
                  contact_phone: finalContactObj.mobile || finalContactObj.landline || log.contact_phone,
                  updatedAt: new Date().toISOString()
                }
              : log
          )
        );
      }

      if (onSaved) {
        onSaved(finalContactObj);
      }

      onClose();
    } catch (err: any) {
      alert('Failed to save contact: ' + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    const targetId = contact?.id || (contact as any)?._id;
    if (!contact || !targetId) {
      return;
    }
    const targetName = fullName || contact.full_name || 'this contact';

    setIsSaving(true);
    try {
      if (setContacts) {
        setContacts((prev) => prev.filter((c) => c.id !== targetId));
      }

      await safeDeleteDoc('contacts', targetId);

      try {
        await recordAuditLog({
          document_id: targetId,
          entity_type: 'contact',
          entity_title: targetName,
          action: 'delete',
          user,
          before: contact,
          details: `Deleted contact person: "${targetName}"`
        });
      } catch (aErr) {
        console.warn('Audit logging error during contact deletion:', aErr);
      }

      if (onSaved) {
        onSaved({ ...contact, id: undefined });
      }

      onClose();
    } catch (err: any) {
      alert('Failed to delete contact: ' + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-slate-900 rounded-2xl max-w-xl w-full border border-slate-800 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 font-sans">
                {isEditing ? 'Edit Contact Person' : 'Create New Contact Person'}
              </h2>
              <p className="text-xs text-slate-400 font-sans">
                {selectedCompany
                  ? `Linking personnel directly to ${selectedCompany.display_name}`
                  : 'Specify contact details'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4 font-sans pr-1">
          {/* Company Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Associated Company
            </label>
            <div className="relative">
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-slate-100"
              >
                <option value="">(Unassigned / Independent Contact)</option>
                {companies.map((comp) => (
                  <option key={comp.id} value={comp.id}>
                    {comp.display_name} ({comp.city}, {comp.country})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Full Name <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full px-3 py-2 text-xs border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-slate-100 placeholder-slate-600"
            />
          </div>

          {/* Designation */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">Designation / Role</label>
            <input
              type="text"
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              placeholder="e.g. Procurement Manager"
              className="w-full px-3 py-2 text-xs border border-slate-800 rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-slate-100 placeholder-slate-600"
            />
          </div>

          {/* Phones Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300">Phone Numbers</label>
              <button
                type="button"
                onClick={handleAddPhone}
                className="text-xs text-indigo-400 font-bold hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Phone</span>
              </button>
            </div>

            {/* Smart Reclaimable Company Phone Numbers */}
            {selectedCompany && availableCompanyPhones.length > 0 && (
              <div className="p-2.5 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-xs space-y-1.5">
                <span className="font-semibold text-indigo-300 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Unassigned Company Phone Numbers:</span>
                </span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {availableCompanyPhones.map((p, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => claimCompanyPhone(p)}
                      className="px-2 py-1 bg-slate-900 border border-indigo-700/50 hover:border-indigo-500 text-indigo-300 rounded-lg text-[11px] font-mono flex items-center space-x-1 shadow-2xs hover:bg-slate-800 transition cursor-pointer"
                      title="Claim this phone number for this personnel"
                    >
                      <span>{p.number}</span>
                      <span className="text-[9px] text-indigo-400 font-sans">({p.label})</span>
                      <ArrowRightLeft className="w-2.5 h-2.5 ml-1" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {phones.map((p, idx) => {
              const currentRestriction = getLineRestriction(editingRestrictedLines, p.value);

              return (
                <div key={p.id || idx} className="flex items-center space-x-2">
                  <select
                    value={p.label}
                    onChange={(e) => handlePhoneChange(idx, 'label', e.target.value)}
                    className="w-32 px-2.5 py-1.5 text-xs border border-slate-800 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-slate-100 font-semibold shrink-0"
                  >
                    {PHONE_LABEL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={p.value}
                    onChange={(e) => handlePhoneChange(idx, 'value', e.target.value)}
                    placeholder="e.g. +971 50 123 4567"
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-800 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 font-mono text-slate-100 placeholder-slate-600 min-w-0"
                  />

                  <button
                    type="button"
                    onClick={() => toggleRestriction(p.value)}
                    disabled={!p.value.trim()}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${
                      currentRestriction === 'DNC'
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                        : currentRestriction === 'Invalid'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                    }`}
                    title={
                      currentRestriction === 'DNC'
                        ? 'Restriction: DNC (Click to Clear)'
                        : currentRestriction === 'Invalid'
                        ? 'Restriction: Invalid (Click for DNC)'
                        : 'Line Active (Click to flag Invalid)'
                    }
                  >
                    <ShieldAlert className={`w-3.5 h-3.5 ${
                      currentRestriction === 'DNC'
                        ? 'text-rose-400'
                        : currentRestriction === 'Invalid'
                        ? 'text-amber-400'
                        : 'text-slate-500'
                    }`} />
                    <span>{currentRestriction || 'Clear'}</span>
                  </button>

                  {phones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePhone(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800/60 transition cursor-pointer shrink-0"
                      title="Remove Phone"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Emails Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300">Email Addresses</label>
              <button
                type="button"
                onClick={handleAddEmail}
                className="text-xs text-indigo-400 font-bold hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Email</span>
              </button>
            </div>

            {/* Smart Reclaimable Company Email Addresses */}
            {selectedCompany && availableCompanyEmails.length > 0 && (
              <div className="p-2.5 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-xs space-y-1.5">
                <span className="font-semibold text-indigo-300 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Unassigned Company Email Addresses:</span>
                </span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {availableCompanyEmails.map((e, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => claimCompanyEmail(e)}
                      className="px-2 py-1 bg-slate-900 border border-indigo-700/50 hover:border-indigo-500 text-indigo-300 rounded-lg text-[11px] font-mono flex items-center space-x-1 shadow-2xs hover:bg-slate-800 transition cursor-pointer"
                      title="Claim this email address for this personnel"
                    >
                      <span>{e.value || e.email}</span>
                      <span className="text-[9px] text-indigo-400 font-sans">({e.label})</span>
                      <ArrowRightLeft className="w-2.5 h-2.5 ml-1" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {emails.map((e, idx) => {
              const currentRestriction = getLineRestriction(editingRestrictedLines, e.value);

              return (
                <div key={e.id || idx} className="flex items-center space-x-2">
                  <select
                    value={e.label}
                    onChange={(eVal) => handleEmailChange(idx, 'label', eVal.target.value)}
                    className="w-32 px-2.5 py-1.5 text-xs border border-slate-800 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-slate-100 font-semibold shrink-0"
                  >
                    {EMAIL_LABEL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                  <input
                    type="email"
                    value={e.value}
                    onChange={(eVal) => handleEmailChange(idx, 'value', eVal.target.value)}
                    placeholder="e.g. john@company.com"
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-800 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-slate-100 font-sans placeholder-slate-600 min-w-0"
                  />

                  <button
                    type="button"
                    onClick={() => toggleRestriction(e.value)}
                    disabled={!e.value.trim()}
                    className={`px-2 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${
                      currentRestriction === 'DNC'
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                        : currentRestriction === 'Invalid'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                    }`}
                    title={
                      currentRestriction === 'DNC'
                        ? 'Restriction: DNC (Click to Clear)'
                        : currentRestriction === 'Invalid'
                        ? 'Restriction: Invalid (Click for DNC)'
                        : 'Address Active (Click to flag Invalid)'
                    }
                  >
                    <ShieldAlert className={`w-3.5 h-3.5 ${
                      currentRestriction === 'DNC'
                        ? 'text-rose-400'
                        : currentRestriction === 'Invalid'
                        ? 'text-amber-400'
                        : 'text-slate-500'
                    }`} />
                    <span>{currentRestriction || 'Clear'}</span>
                  </button>

                  {emails.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800/60 transition cursor-pointer shrink-0"
                      title="Remove Email"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Messaging & Social Handles Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-300">Messaging & Social Handles</label>
              <button
                type="button"
                onClick={handleAddHandle}
                className="text-xs text-indigo-400 font-bold hover:underline flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Handle</span>
              </button>
            </div>

            {handles.length === 0 && (
              <p className="text-[11px] text-slate-500 italic">No messaging handles added. Click "Add Handle" to add WhatsApp, Telegram, LinkedIn, etc.</p>
            )}

            {handles.map((h, idx) => (
              <div key={idx} className="flex items-center space-x-2">
                <select
                  value={h.platform}
                  onChange={(e) => handleHandleChange(idx, 'platform', e.target.value)}
                  className="w-32 px-2.5 py-1.5 text-xs border border-slate-800 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 text-slate-100 font-medium"
                >
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Telegram">Telegram</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="WeChat">WeChat</option>
                  <option value="Skype">Skype</option>
                  <option value="Signal">Signal</option>
                  <option value="Other">Other</option>
                </select>
                <input
                  type="text"
                  value={h.handle}
                  onChange={(e) => handleHandleChange(idx, 'handle', e.target.value)}
                  placeholder="e.g. +971501234567 or @username"
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-800 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-slate-950 font-mono text-slate-100 placeholder-slate-600"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveHandle(idx)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800/60 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Additional Controls */}
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="w-4 h-4 text-indigo-600 bg-slate-950 border-slate-700 rounded focus:ring-indigo-500"
              />
              <span className="text-xs font-bold text-slate-200">
                Set as Primary Contact Person for this company
              </span>
            </label>

            {/* Sleek Modern DNC Toggle & Alert Pill */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              isDnc
                ? 'bg-rose-950/40 border-rose-600/80 shadow-md shadow-rose-950/20'
                : 'bg-slate-950/80 border-slate-800'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5">
                  <div className={`p-1.5 rounded-lg shrink-0 ${isDnc ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <span className={`text-xs font-bold block ${isDnc ? 'text-rose-200' : 'text-slate-300'}`}>
                      Do Not Call (DNC) Restriction
                    </span>
                    <span className="text-[10px] text-slate-400 block leading-tight">
                      {isDnc ? 'Contact is flagged for no direct outreach' : 'Allow direct communications and outreach'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDnc(!isDnc)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isDnc ? 'bg-rose-600' : 'bg-slate-700'
                  }`}
                  title={isDnc ? 'Disable DNC restriction' : 'Enable DNC restriction'}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isDnc ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {isDnc && (
                <div className="mt-3 pt-2.5 border-t border-rose-900/40">
                  <label className="block text-[10px] font-mono text-rose-300 uppercase tracking-wider mb-1 font-bold">
                    DNC Reason / Notes
                  </label>
                  <input
                    type="text"
                    value={dncReason}
                    onChange={(e) => setDncReason(e.target.value)}
                    placeholder="e.g. Requested opt-out via email, Unsubscribed..."
                    className="w-full px-3 py-2 text-xs border border-rose-800/80 bg-slate-900 rounded-lg text-rose-100 placeholder-rose-700 focus:border-rose-500 focus:outline-none font-medium"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <div>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleDeleteContact}
                  disabled={isSaving}
                  className="px-3 py-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Contact</span>
                </button>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !activeWorkspaceId}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : isEditing ? 'Update Contact' : 'Save Contact'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
