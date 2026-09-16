import React, { useState, useEffect } from 'react';
import { X, Hash, Sparkles, User, Building, FileText, CheckCircle2, Loader2 } from 'lucide-react';
import { Company, Salesperson, Workspace, Enquiry } from '../types';
import { previewNextEnquirySequence, claimNextEnquirySequence, getWorkspaceSequenceCounters, getSequencePeriodKey, formatPattern } from '../services/enquirySequences';
import { safeAddDoc } from '../firebase';

interface QuickClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspace?: Workspace | null;
  user: any;
  salespersons: Salesperson[];
  companies: Company[];
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onSuccess?: (claimedEnquiry: Enquiry) => void;
}

export const QuickClaimModal: React.FC<QuickClaimModalProps> = ({
  isOpen,
  onClose,
  activeWorkspace,
  user,
  salespersons,
  companies,
  triggerToast,
  onSuccess
}) => {
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [repInitials, setRepInitials] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [previewRef, setPreviewRef] = useState<string>('');
  const [previewSn, setPreviewSn] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);

  // Initialize selected rep to current user if matching
  useEffect(() => {
    if (!isOpen) return;

    if (user?.email) {
      const match = salespersons.find(
        s => s.email?.toLowerCase() === user.email?.toLowerCase() ||
             ((s as any).name || s.full_name)?.toLowerCase() === (user.name || user.full_name)?.toLowerCase()
      );
      if (match) {
        const name = (match as any).name || match.full_name;
        setSelectedRep(name);
        setRepInitials(match.initials || name.slice(0, 2).toUpperCase());
        return;
      }
    }

    if (salespersons.length > 0) {
      const first = salespersons[0];
      const name = (first as any).name || first.full_name;
      setSelectedRep(name);
      setRepInitials(first.initials || name.slice(0, 2).toUpperCase());
    }
  }, [isOpen, user, salespersons]);

  // Live Next Sequence Resolution: On mount, fetch fresh counters from Firestore
  useEffect(() => {
    if (!isOpen || !activeWorkspace?.id) return;

    let isMounted = true;
    setIsLoadingPreview(true);

    getWorkspaceSequenceCounters(activeWorkspace.id)
      .then((counters) => {
        if (!isMounted) return;
        const now = new Date();
        const periodKey = getSequencePeriodKey(counters.resetCadence, now);
        const nextSn = (counters.lastSnNumber || 0) + 1;
        const nextSeq = (counters.sequences?.[periodKey] || 0) + 1;

        const liveQuoteRef = formatPattern(counters.pattern, {
          seq: nextSeq,
          prefix: counters.prefix,
          date: now,
          rep: repInitials
        });

        setPreviewRef(liveQuoteRef);
        setPreviewSn(nextSn);
        setIsLoadingPreview(false);
      })
      .catch((err) => {
        console.error('Error fetching live sequence counters:', err);
        // Fallback to previewNextEnquirySequence
        previewNextEnquirySequence(activeWorkspace.id, repInitials, new Date())
          .then(res => {
            if (isMounted) {
              setPreviewRef(res.quoteRef);
              setPreviewSn(res.sn);
              setIsLoadingPreview(false);
            }
          })
          .catch(() => {
            if (isMounted) setIsLoadingPreview(false);
          });
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeWorkspace?.id, repInitials]);

  if (!isOpen) return null;

  const handleRepChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedRep(val);
    const found = salespersons.find(s => ((s as any).name || s.full_name) === val);
    if (found) {
      const name = (found as any).name || found.full_name;
      setRepInitials(found.initials || name.slice(0, 2).toUpperCase());
    } else {
      setRepInitials('');
    }
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace?.id) {
      triggerToast?.('No active workspace selected', 'error');
      return;
    }

    setIsClaiming(true);
    try {
      // 1. Atomically claim sequential quote reference and S/N
      const claimed = await claimNextEnquirySequence(
        activeWorkspace.id,
        repInitials,
        user?.uid || user?.id || 'system'
      );

      // Find company ID if existing match safely by display_name, canonical_name, or legacy name
      const targetCompName = (companyName || '').trim().toLowerCase();
      const matchedCompany = targetCompName
        ? companies.find((c) => {
            const name = (c.display_name || c.canonical_name || (c as any).name || '').trim().toLowerCase();
            return name === targetCompName;
          })
        : undefined;

      const todayStr = new Date().toISOString().split('T')[0];

      // 2. Insert minimal draft stub enquiry
      const stubPayload: any = {
        sn: claimed.sn,
        enquiry_date: todayStr,
        logged_date: todayStr,
        quote_ref_no: claimed.quoteRef,
        sales_person: repInitials || selectedRep,
        sales_person_id: salespersons.find(s => ((s as any).name || s.full_name) === selectedRep)?.id || '',
        company_id: matchedCompany?.id || '',
        company_name: (companyName || '').trim() || matchedCompany?.display_name || matchedCompany?.canonical_name || 'Unassigned / TBD',
        subject: (subject || '').trim() || 'Quote Reference Reserved',
        status: 'Active',
        country: 'UAE',
        project_location: '',
        enquiry_source: 'Email',
        value_aed: 0,
        currency: 'AED',
        line_items: [],
        workspace_id: activeWorkspace.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUid: user?.uid || user?.id || 'system',
        createdByUsername: user?.name || user?.email || 'User'
      };

      const docRef = await safeAddDoc('enquiries', stubPayload);
      const newEnquiry: Enquiry = {
        id: docRef?.id || `enq_stub_${Date.now()}`,
        ...stubPayload
      };

      try {
        await safeAddDoc('audit_logs', {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          document_id: newEnquiry.id,
          entity_type: 'enquiry',
          action: 'create',
          changed_by_uid: user?.uid || user?.id || 'system',
          changed_by_name: user?.name || user?.email || 'User',
          timestamp: new Date().toISOString(),
          before: {},
          after: stubPayload,
          changes: [{ field: 'quote_ref_no', to: claimed.quoteRef, note: 'Reserved sequential quote reference' }]
        });
      } catch (auditErr) {
        console.warn('Could not record audit log:', auditErr);
      }

      // Broadcast toast notification across workspace
      triggerToast?.(
        `Claimed Quote Ref #${claimed.sn}: ${claimed.quoteRef} reserved successfully!`,
        'success'
      );

      if (onSuccess) {
        onSuccess(newEnquiry);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to claim quote ref:', err);
      triggerToast?.(err.message || 'Failed to claim quote reference', 'error');
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <Hash className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Claim Quote Reference</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Reserve the next sequential Quote Ref &amp; S/N atomically
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Sequence Preview Card */}
        <div className="px-6 pt-5 pb-2">
          <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/40 dark:from-slate-800 dark:to-blue-950/30 border border-blue-100 dark:border-blue-900/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 tracking-wide uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Next Allocated Quote Reference
              </span>
              {previewSn !== null && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
                  S/N #{previewSn}
                </span>
              )}
            </div>
            <div className="text-xl font-mono font-black text-slate-900 dark:text-white tracking-tight py-1">
              {isLoadingPreview ? (
                <span className="flex items-center gap-2 text-slate-400 text-sm font-normal">
                  <Loader2 className="w-4 h-4 animate-spin" /> Calculating next reference...
                </span>
              ) : (
                previewRef || 'Generating...'
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Guaranteed race-free reservation based on current {activeWorkspace?.name || 'workspace'} settings.
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleClaim} className="px-6 py-4 space-y-4">
          {/* Sales Representative */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" /> Sales Representative
            </label>
            <select
              value={selectedRep}
              onChange={handleRepChange}
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100 transition"
              required
            >
              {salespersons.map(s => {
                const name = (s as any).name || s.full_name;
                return (
                  <option key={s.id || name} value={name}>
                    {name} {s.initials ? `(${s.initials})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Client / Company Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" /> Client / Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Al Wasl Contracting or leave empty for stub"
              list="quick-claim-companies"
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100 transition"
            />
            <datalist id="quick-claim-companies">
              {companies.map((c) => {
                const name = c.display_name || c.canonical_name || (c as any).name || '';
                return name ? <option key={c.id || name} value={name} /> : null;
              })}
            </datalist>
          </div>

          {/* Subject / Scope Brief */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Subject / Scope (Optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. 500 GPD RO System Supply"
              className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-slate-100 transition"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isClaiming}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-sm hover:shadow transition disabled:opacity-50"
            >
              {isClaiming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Claiming...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Claim &amp; Reserve Reference
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
