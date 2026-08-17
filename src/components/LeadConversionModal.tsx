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
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl shadow-md text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Convert Lead to CRM Client</span>
              </h3>
              <p className="text-xs text-slate-400">
                Promote this unsaved lead into a permanent Company & Contact profile.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          
          {errorMessage && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-rose-200 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Active Workspace Banner */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-slate-300">
              <Briefcase className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Target Workspace Context:</span>
            </div>
            <span className="font-bold text-blue-300 font-mono bg-blue-950/80 px-2.5 py-1 rounded-md border border-blue-800/60">
              {activeWorkspace?.name || 'Default Workspace'}
            </span>
          </div>

          {/* Company Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              New Company Name <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. Acme Corp / Global Trading LLC"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Primary Contact Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Primary Contact Representative <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={contactName}
                onChange={(e) => {
                  setContactName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. John Smith"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Contact Phone & Email Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Phone / Mobile Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+971 50 123 4567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@company.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-950/40 border border-blue-900/60 rounded-xl text-[11px] text-blue-200/90 leading-relaxed">
            <strong className="text-blue-300">Atomic Conversion Note:</strong> Converting this lead will instantly create a linked Company profile and Primary Contact record, and link this activity log to them.
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
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
