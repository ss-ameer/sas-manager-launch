import React, { useState, useEffect } from 'react';
import { CallLogEntry, Company, Contact, Workspace, UserProfile } from '../types';
import { ActivityLogRepository } from '../services/repositories/ActivityLogRepository';
import {
  Building2,
  User,
  Phone,
  Mail,
  Sparkles,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Briefcase
} from 'lucide-react';

interface LeadConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: CallLogEntry | null;
  activeWorkspace: Workspace;
  currentUser?: UserProfile | null;
  onSuccess: (updatedEntry: CallLogEntry, newCompany: Company, newContact: Contact) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function LeadConversionModal({
  isOpen,
  onClose,
  entry,
  activeWorkspace,
  currentUser,
  onSuccess,
  triggerToast
}: LeadConversionModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && entry) {
      const rawName = entry.unlinked_name || entry.contact_name || '';
      const rawContactInfo = entry.unlinked_contact_info || entry.contact_phone || '';

      setCompanyName(rawName || 'Unknown Lead Company');
      setContactName(rawName || 'Primary Lead Contact');

      if (rawContactInfo.includes('@')) {
        setEmail(rawContactInfo);
        setPhone(entry.contact_phone || '');
      } else {
        setPhone(rawContactInfo);
        setEmail('');
      }

      setErrorMessage(null);
    }
  }, [isOpen, entry]);

  if (!isOpen || !entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!activeWorkspace?.id) {
      setErrorMessage('Active workspace context is missing. Cannot proceed with lead conversion.');
      return;
    }

    if (!companyName.trim()) {
      setErrorMessage('Please enter a Company Name for the new CRM record.');
      return;
    }

    if (!contactName.trim()) {
      setErrorMessage('Please enter a Contact Representative name.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await ActivityLogRepository.convertUnsavedLeadToClient({
        entry,
        companyName: companyName.trim(),
        contactName: contactName.trim(),
        contactPhone: phone.trim() || undefined,
        contactEmail: email.trim() || undefined,
        workspaceId: activeWorkspace.id,
        user: currentUser
          ? {
              uid: currentUser.uid,
              name: currentUser.full_name || currentUser.username || currentUser.email || 'User'
            }
          : undefined
      });

      if (triggerToast) {
        triggerToast('Lead successfully converted to CRM Client!', 'success');
      }

      onSuccess(result.updatedEntry, result.newCompany, result.newContact);
      onClose();
    } catch (err: any) {
      console.error('[LeadConversionModal] Conversion error:', err);
      setErrorMessage(err?.message || 'Failed to convert lead to CRM Client. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl text-slate-900 max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-md text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Convert Lead to CRM Client</span>
              </h3>
              <p className="text-xs text-slate-500">
                Promote this unsaved lead into a permanent Company & Contact profile.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Active Workspace Banner */}
          <div className="p-3 bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-slate-700">
              <Briefcase className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Target Workspace Context:</span>
            </div>
            <span className="font-bold text-blue-700 font-mono bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
              {activeWorkspace?.name || 'Default Workspace'}
            </span>
          </div>

          {/* Company Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              New Company Name <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. Acme Corp / Global Trading LLC"
                className="w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-hidden"
                required
              />
            </div>
          </div>

          {/* Primary Contact Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Primary Contact Representative <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={contactName}
                onChange={(e) => {
                  setContactName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. John Smith"
                className="w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-hidden"
                required
              />
            </div>
          </div>

          {/* Contact Phone & Email Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Phone / Mobile Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+971 50 123 4567"
                  className="w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-9 pr-3 py-2 text-xs font-mono focus:outline-hidden"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@company.com"
                  className="w-full bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl pl-9 pr-3 py-2 text-xs font-mono focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-[11px] text-blue-800 leading-relaxed">
            <strong className="text-blue-900">Atomic Conversion Note:</strong> Converting this lead will instantly create a linked Company profile and Primary Contact record, and link this activity log to them.
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Confirm & Convert to CRM</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
