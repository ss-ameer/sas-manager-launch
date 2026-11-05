import React, { useState, useEffect, useMemo } from 'react';
import { X, Hash, Sparkles, User, Building, FileText, CheckCircle2, Loader2, Tag, Globe } from 'lucide-react';
import { Company, Salesperson, Workspace, Enquiry, resolveCountryCode, sanitizeCompanyCode } from '../types';
import {
  previewNextEnquirySequence,
  claimNextEnquirySequence,
  getWorkspaceSequenceCounters,
  getSequencePeriodKey,
  formatPattern,
  getWorkspaceActiveCeilings,
  patternRequiresCompanyCode,
  patternRequiresCountryCode
} from '../services/enquirySequences';
import { safeAddDoc, safeUpdateDoc } from '../firebase';
import { CompanyRepository } from '../services/repositories/CompanyRepository';

interface QuickClaimModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspace?: Workspace | null;
  user: any;
  salespersons: Salesperson[];
  companies: Company[];
  enquiries?: Enquiry[];
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
  enquiries = [],
  triggerToast,
  onSuccess
}) => {
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [repInitials, setRepInitials] = useState<string>('');
  const [companyName, setCompanyName] = useState<string>('');
  const [companyCodeInput, setCompanyCodeInput] = useState<string>('');
  const [countryInput, setCountryInput] = useState<string>('UAE');
  const [subject, setSubject] = useState<string>('');
  const [activePattern, setActivePattern] = useState<string>('');
  const [activePrefix, setActivePrefix] = useState<string>('');
  const [previewRef, setPreviewRef] = useState<string>('');
  const [previewSn, setPreviewSn] = useState<number | null>(null);
  const [previewSeq, setPreviewSeq] = useState<number | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(false);
  const [isClaiming, setIsClaiming] = useState<boolean>(false);

  // Match typed company against registered companies (by name or company_code)
  const matchedCompany = useMemo(() => {
    const clean = (companyName || '').trim().toLowerCase();
    if (!clean) return undefined;
    return companies.find((c) => {
      const name = (c.display_name || c.canonical_name || (c as any).name || '').trim().toLowerCase();
      const code = (c.company_code || '').trim().toLowerCase();
      return name === clean || (code && code === clean);
    });
  }, [companyName, companies]);

  // Sync company code and country when a registered company is matched
  useEffect(() => {
    if (matchedCompany) {
      setCompanyCodeInput(matchedCompany.company_code || '');
      if (matchedCompany.country) {
        setCountryInput(matchedCompany.country);
      }
    }
  }, [matchedCompany?.id]);

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

  // Live Next Sequence Resolution: On mount, fetch fresh counters from Firestore and reconcile with active registry ceilings
  useEffect(() => {
    if (!isOpen || !activeWorkspace?.id) return;

    let isMounted = true;
    setIsLoadingPreview(true);

    // 1. Resolve active registry proposals from props or local cache fallback
    let candidateEnquiries = enquiries;
    if (!candidateEnquiries || candidateEnquiries.length === 0) {
      try {
        const saved = localStorage.getItem('omni_enquiries');
        if (saved) {
          candidateEnquiries = JSON.parse(saved);
        }
      } catch (e) {
        // ignore cache read failure
      }
    }

    getWorkspaceSequenceCounters(activeWorkspace.id)
      .then((counters) => {
        if (!isMounted) return;
        const now = new Date();

        const resolvedPattern = (activeWorkspace as any)?.settings?.quote_sequence_pattern || counters.pattern || '{SEQ}-{DD}{MM}{YY}';
        // Calculate dynamic active ceilings from registered proposals
        const { maxSn, maxSeq } = getWorkspaceActiveCeilings(
          candidateEnquiries || [],
          activeWorkspace.id,
          resolvedPattern
        );

        // S/N: Respect baseline overrides if higher than maxSn, but clamp down phantom counters to maxSn + 1
        const baselineSn = (activeWorkspace as any)?.settings?.next_sn_baseline || 0;
        const displayNextSn = Math.max(baselineSn, maxSn + 1);

        // Sequence: Respect baseline overrides if higher than maxSeq, but clamp down phantom counters to maxSeq + 1
        const baselineSeq = (activeWorkspace as any)?.settings?.next_seq_baseline || 0;
        const displayNextSeq = Math.max(baselineSeq, maxSeq + 1);

        const prefix = (activeWorkspace as any)?.settings?.quote_prefix !== undefined
          ? (activeWorkspace as any).settings.quote_prefix
          : (counters.prefix || '');

        setActivePattern(resolvedPattern);
        setActivePrefix(prefix);

        const liveQuoteRef = formatPattern(resolvedPattern, {
          seq: displayNextSeq,
          prefix: prefix,
          date: now,
          rep: repInitials,
          country: countryInput || matchedCompany?.country || 'UAE',
          countryCode: matchedCompany?.country_code || '',
          companyCode: sanitizeCompanyCode(companyCodeInput || matchedCompany?.company_code)
        });

        setPreviewRef(liveQuoteRef);
        setPreviewSn(displayNextSn);
        setPreviewSeq(displayNextSeq);
        setIsLoadingPreview(false);
      })
      .catch((err) => {
        console.error('Error fetching live sequence counters:', err);
        previewNextEnquirySequence(activeWorkspace.id, repInitials, new Date(), candidateEnquiries, {
          country: countryInput || matchedCompany?.country || 'UAE',
          countryCode: matchedCompany?.country_code || '',
          companyCode: sanitizeCompanyCode(companyCodeInput || matchedCompany?.company_code)
        })
          .then(res => {
            if (isMounted) {
              setPreviewRef(res.quoteRef);
              setPreviewSn(res.sn);
              setPreviewSeq(res.sequence || null);
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
  }, [isOpen, activeWorkspace?.id, repInitials, enquiries]);

  // Live-update previewRef when companyCodeInput, countryInput, or matchedCompany changes
  useEffect(() => {
    if (!isOpen || !activePattern || previewSeq === null) return;
    const liveQuoteRef = formatPattern(activePattern, {
      seq: previewSeq,
      prefix: activePrefix,
      date: new Date(),
      rep: repInitials,
      country: countryInput || matchedCompany?.country || 'UAE',
      countryCode: matchedCompany?.country_code || '',
      companyCode: sanitizeCompanyCode(companyCodeInput || matchedCompany?.company_code)
    });
    setPreviewRef(liveQuoteRef);
  }, [activePattern, activePrefix, previewSeq, repInitials, companyCodeInput, countryInput, matchedCompany]);

  if (!isOpen) return null;

  const needsCompanyCode = patternRequiresCompanyCode(activePattern);
  const needsCountryCode = patternRequiresCountryCode(activePattern);

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

    let candidateEnquiries = enquiries;
    if (!candidateEnquiries || candidateEnquiries.length === 0) {
      try {
        const saved = localStorage.getItem('omni_enquiries');
        if (saved) {
          candidateEnquiries = JSON.parse(saved);
        }
      } catch (e) {
        // ignore cache read failure
      }
    }

    const effectiveCompanyCode = sanitizeCompanyCode(companyCodeInput || matchedCompany?.company_code);
    const effectiveCountry = (countryInput || matchedCompany?.country || 'UAE').trim();

    setIsClaiming(true);
    try {
      // Save Company Code back to matched company record if newly provided
      if (matchedCompany?.id && effectiveCompanyCode && effectiveCompanyCode !== matchedCompany.company_code) {
        try {
          const compPatch: Partial<Company> = {
            company_code: effectiveCompanyCode,
            updatedAt: new Date().toISOString()
          };
          await safeUpdateDoc('companies', matchedCompany.id, compPatch);
          await CompanyRepository.updateCompany(matchedCompany.id, compPatch).catch(() => {});
        } catch (compErr) {
          console.warn('Could not persist company code on quick claim:', compErr);
        }
      }

      // 1. Atomically claim sequential quote reference and S/N locked to preview
      const claimed = await claimNextEnquirySequence(
        activeWorkspace.id,
        repInitials,
        user?.uid || user?.id || 'system',
        new Date(),
        {
          targetSn: previewSn || undefined,
          targetSeq: previewSeq || undefined,
          companyAccount: matchedCompany?.display_name || (companyName || '').trim(),
          companyCode: effectiveCompanyCode,
          country: effectiveCountry,
          countryCode: matchedCompany?.country_code || '',
          salesPerson: selectedRep,
          assignedSalesperson: selectedRep,
          enquiries: candidateEnquiries
        }
      );

      const todayStr = new Date().toISOString().split('T')[0];

      // 2. Insert minimal draft stub enquiry
      const currentUserId = user?.uid || user?.id || 'system';
      const repOrName = repInitials || selectedRep;
      const spId = salespersons.find(s => ((s as any).name || s.full_name) === selectedRep)?.id || '';

      const stubPayload: any = {
        sn: claimed.sn,
        enquiry_date: todayStr,
        logged_date: todayStr,
        quote_ref_no: claimed.quoteRef,
        sales_person: repOrName,
        salesperson: repOrName,
        assignedSalesperson: repOrName,
        sales_person_id: spId,
        salesperson_id: spId,
        assigned_to_id: spId || currentUserId,
        assigned_to: repOrName,
        company_id: matchedCompany?.id || '',
        company_name: matchedCompany?.display_name || matchedCompany?.canonical_name || (companyName || '').trim() || 'Unassigned / TBD',
        subject: (subject || '').trim() || 'Quote Reference Reserved',
        status: 'Active',
        country: effectiveCountry,
        project_location: matchedCompany?.city || '',
        enquiry_source: 'Email',
        value_aed: 0,
        currency: 'AED',
        line_items: [],
        workspace_id: activeWorkspace.id,
        workspaceId: activeWorkspace.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: currentUserId,
        created_by: currentUserId,
        createdByUid: currentUserId,
        created_by_uid: currentUserId,
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-slate-400" /> Client / Company Name
              </label>
              {matchedCompany && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  Paired: {matchedCompany.display_name}
                  {matchedCompany.company_code ? ` [${matchedCompany.company_code}]` : ''}
                </span>
              )}
            </div>
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
                return name ? (
                  <option key={c.id || name} value={name}>
                    {c.company_code ? `[${c.company_code}] ${c.country || ''}` : c.country || ''}
                  </option>
                ) : null;
              })}
            </datalist>
          </div>

          {/* Structured Pattern Tokens: Company Code & Country */}
          {(needsCompanyCode || needsCountryCode) && (
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700">
              {needsCompanyCode && (
                <div className={needsCountryCode ? '' : 'col-span-2'}>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3 text-indigo-500" /> Company Code
                    </span>
                    {matchedCompany && !matchedCompany.company_code && companyCodeInput && (
                      <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-normal">
                        Saves to profile
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={companyCodeInput}
                    onChange={(e) => setCompanyCodeInput(sanitizeCompanyCode(e.target.value))}
                    placeholder="e.g. CWE, BME"
                    maxLength={12}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-white"
                  />
                </div>
              )}
              {needsCountryCode && (
                <div className={needsCompanyCode ? '' : 'col-span-2'}>
                  <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Globe className="w-3 h-3 text-blue-500" /> Country
                    </span>
                    <span className="text-[9px] font-mono text-slate-400">
                      Code: {resolveCountryCode(countryInput, matchedCompany?.country_code) || 'UAE'}
                    </span>
                  </label>
                  <input
                    type="text"
                    value={countryInput}
                    onChange={(e) => setCountryInput(e.target.value)}
                    placeholder="e.g. UAE, KSA, Oman"
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white"
                  />
                </div>
              )}
            </div>
          )}

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
