import React, { useState, useEffect, useMemo } from 'react';
import {
  Company,
  Workspace,
  UserProfile,
  DropdownOption,
  CallLogEntry,
  LegalSuffix
} from '../types';
import { safeAddDoc, safeUpdateDoc } from '../firebase';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { recordAuditLog } from '../utils/auditLogger';
import { findDuplicateCompany } from '../utils/fuzzyMatch';
import { PARENT_INDUSTRIES, getDistinctRawBusinessTypes } from '../utils/taxonomy';
import { useIndustryTaxonomy } from '../hooks/useIndustryTaxonomy';
import IndustryTaxonomySelector from './common/IndustryTaxonomySelector';
import {
  Building2,
  X,
  Search,
  Plus,
  Trash2,
  ShieldAlert,
  Loader2
} from 'lucide-react';

interface CompanyEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  company?: Company | null;
  companyId?: string | null;
  companies: Company[];
  activeWorkspace?: Workspace;
  user: UserProfile;
  companyRelationships?: DropdownOption[];
  industryTypes?: DropdownOption[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onSaved?: (savedCompany: Company) => void;
}

function generateId(): string {
  return 'cm_' + Math.random().toString(36).substring(2, 9);
}

function computeCanonicalName(name?: any): string {
  if (!name) return '';
  return String(typeof name === 'object' ? (name.name || name.label || '') : name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function generateCompanySearchTerms(displayName: string, city: string, phones: any[]): string[] {
  const terms = new Set<string>();
  if (displayName) {
    terms.add(displayName.toLowerCase());
    displayName.toLowerCase().split(/\s+/).forEach((w) => w && terms.add(w));
  }
  if (city) {
    terms.add(city.toLowerCase());
  }
  if (phones && Array.isArray(phones)) {
    phones.forEach((p) => {
      const num = typeof p === 'string' ? p : p?.number || p?.value || '';
      const clean = String(num).replace(/\D/g, '');
      if (clean) terms.add(clean);
    });
  }
  return Array.from(terms);
}

function getLineRestriction(restrictedLines: Record<string, string> | undefined, phoneValue?: any): 'DNC' | 'Invalid' | null {
  if (!phoneValue || !restrictedLines) return null;
  const strVal = String(phoneValue);
  const digits = strVal.replace(/\D/g, '');
  if (restrictedLines[digits]) return restrictedLines[digits] as 'DNC' | 'Invalid';
  if (restrictedLines[strVal]) return restrictedLines[strVal] as 'DNC' | 'Invalid';
  return null;
}

export default function CompanyEditModal({
  isOpen,
  onClose,
  company,
  companyId,
  companies,
  activeWorkspace,
  user,
  companyRelationships = [],
  industryTypes = [],
  setCompanies,
  setCallLogs,
  triggerToast,
  onSaved
}: CompanyEditModalProps) {
  const targetCompany = useMemo(() => {
    if (company) return company;
    if (companyId) return companies.find((c) => c.id === companyId) || null;
    return null;
  }, [company, companyId, companies]);

  const [canonicalName, setCanonicalName] = useState('');
  const [legalSuffix, setLegalSuffix] = useState<LegalSuffix>('None / To Be Added Later');
  const [aliasesInput, setAliasesInput] = useState('');
  const { findParentForSubtype } = useIndustryTaxonomy();
  const [city, setCity] = useState('Sharjah');
  const [country, setCountry] = useState('UAE');
  const [industryParent, setIndustryParent] = useState('');
  const [businessTypeRaw, setBusinessTypeRaw] = useState('');
  const [relationship, setRelationship] = useState('Prospect');
  const [temperature, setTemperature] = useState<'Cold' | 'Warm' | 'Hot' | 'DNC'>('Cold');
  const [notes, setNotes] = useState('');

  const [companyPhones, setCompanyPhones] = useState<Array<{ id: string; label: string; value: string }>>([
    { id: generateId(), label: 'Landline', value: '' }
  ]);
  const [companyEmails, setCompanyEmails] = useState<Array<{ id: string; label: string; value: string }>>([
    { id: generateId(), label: 'Work', value: '' }
  ]);
  const [companyLinks, setCompanyLinks] = useState<Array<{ id: string; label: string; url: string }>>([
    { id: generateId(), label: 'Website', url: '' }
  ]);
  const [restrictedLines, setRestrictedLines] = useState<Record<string, string>>({});

  const [duplicateMatchResult, setDuplicateMatchResult] = useState<any>(null);
  const [pendingBypass, setPendingBypass] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state whenever modal opens or targetCompany changes
  useEffect(() => {
    if (!isOpen) return;

    if (targetCompany) {
      let baseName = targetCompany.display_name || targetCompany.canonical_name || '';
      if (
        targetCompany.legal_suffix &&
        targetCompany.legal_suffix !== 'None / Other' &&
        targetCompany.legal_suffix !== 'None / To Be Added Later'
      ) {
        const suffixWithSpace = ` ${targetCompany.legal_suffix}`;
        if (baseName.endsWith(suffixWithSpace)) {
          baseName = baseName.slice(0, -suffixWithSpace.length);
        }
      }
      setCanonicalName(baseName);
      setLegalSuffix(targetCompany.legal_suffix || 'None / To Be Added Later');
      setAliasesInput((targetCompany.aliases || []).join(', '));
      setCity(targetCompany.city || 'Sharjah');
      setCountry(targetCompany.country || 'UAE');
      const rawVal = targetCompany.business_type_raw || targetCompany.industry || targetCompany.industry_type || '';
      let resolvedParent = targetCompany.industry_parent || '';
      if (!resolvedParent && rawVal) {
        const detected = findParentForSubtype(rawVal);
        if (detected) {
          resolvedParent = detected.id;
        }
      }
      setIndustryParent(resolvedParent);
      setBusinessTypeRaw(rawVal);
      setRelationship(targetCompany.relationship || 'Prospect');
      setTemperature(targetCompany.temperature || 'Cold');
      setNotes(targetCompany.notes || '');
      setRestrictedLines(targetCompany.restricted_lines || {});

      // Phones
      let mappedPhones: Array<{ id: string; label: string; value: string }> = [];
      if (Array.isArray(targetCompany.general_phones) && targetCompany.general_phones.length > 0) {
        mappedPhones = targetCompany.general_phones.map((p) => ({
          id: p.id || generateId(),
          label: p.label || 'Landline',
          value: p.value || (p as any).number || ''
        }));
      } else if (Array.isArray(targetCompany.phones) && targetCompany.phones.length > 0) {
        mappedPhones = targetCompany.phones.map((p: any) => ({
          id: p.id || generateId(),
          label: p.label || 'Landline',
          value: p.number || p.value || ''
        }));
      } else if (targetCompany.general_phone || targetCompany.phone) {
        mappedPhones = [
          { id: generateId(), label: 'Main', value: targetCompany.general_phone || targetCompany.phone || '' }
        ];
      }
      setCompanyPhones(
        mappedPhones.length > 0 ? mappedPhones : [{ id: generateId(), label: 'Landline', value: '' }]
      );

      // Emails
      let mappedEmails: Array<{ id: string; label: string; value: string }> = [];
      if (Array.isArray(targetCompany.general_emails) && targetCompany.general_emails.length > 0) {
        mappedEmails = targetCompany.general_emails.map((e) => ({
          id: e.id || generateId(),
          label: e.label || 'Work',
          value: e.value || (e as any).email || ''
        }));
      } else if (Array.isArray(targetCompany.emails) && targetCompany.emails.length > 0) {
        mappedEmails = targetCompany.emails.map((e: any) => ({
          id: e.id || generateId(),
          label: e.label || 'Work',
          value: e.email || e.value || ''
        }));
      } else if (targetCompany.general_email || targetCompany.email) {
        mappedEmails = [
          { id: generateId(), label: 'Main', value: targetCompany.general_email || targetCompany.email || '' }
        ];
      }
      setCompanyEmails(
        mappedEmails.length > 0 ? mappedEmails : [{ id: generateId(), label: 'Work', value: '' }]
      );

      // Links
      if (Array.isArray(targetCompany.links) && targetCompany.links.length > 0) {
        setCompanyLinks(
          targetCompany.links.map((l) => ({
            id: l.id || generateId(),
            label: l.label || 'Website',
            url: l.url || ''
          }))
        );
      } else if (targetCompany.website) {
        setCompanyLinks([{ id: generateId(), label: 'Website', url: targetCompany.website }]);
      } else {
        setCompanyLinks([{ id: generateId(), label: 'Website', url: '' }]);
      }

      setDuplicateMatchResult(null);
      setPendingBypass(false);
    } else {
      // Add mode defaults
      setCanonicalName('');
      setLegalSuffix('None / To Be Added Later');
      setAliasesInput('');
      setCity('Sharjah');
      setCountry('UAE');
      setIndustryParent('');
      setBusinessTypeRaw('');
      setRelationship('Prospect');
      setTemperature('Cold');
      setNotes('');
      setCompanyPhones([{ id: generateId(), label: 'Landline', value: '' }]);
      setCompanyEmails([{ id: generateId(), label: 'Work', value: '' }]);
      setCompanyLinks([{ id: generateId(), label: 'Website', url: '' }]);
      setRestrictedLines({});
      setDuplicateMatchResult(null);
      setPendingBypass(false);
    }
  }, [isOpen, targetCompany]);

  const distinctRawBusinessTypes = useMemo(() => {
    return getDistinctRawBusinessTypes(companies);
  }, [companies]);

  const togglePhoneRestriction = (phoneVal: string) => {
    if (!phoneVal.trim()) return;
    const digits = phoneVal.replace(/\D/g, '');
    const current = getLineRestriction(restrictedLines, phoneVal);
    let next: 'Invalid' | 'DNC' | null = null;
    if (!current) next = 'Invalid';
    else if (current === 'Invalid') next = 'DNC';
    else next = null;

    setRestrictedLines((prev) => {
      const copy = { ...prev };
      if (!next) {
        delete copy[digits];
        delete copy[phoneVal];
      } else {
        copy[digits] = next;
        copy[phoneVal] = next;
      }
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canonicalName.trim()) return;

    if (!targetCompany && !pendingBypass) {
      const matchRes = findDuplicateCompany(canonicalName, companies);
      if (matchRes) {
        setDuplicateMatchResult(matchRes);
        return;
      }
    }

    const aliasesArr = aliasesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const displayName =
      legalSuffix === 'None / Other' || legalSuffix === 'None / To Be Added Later'
        ? canonicalName.trim()
        : `${canonicalName.trim()} ${legalSuffix}`;

    if (isSaving) return;
    setIsSaving(true);

    const workspaceId = activeWorkspace?.id || targetCompany?.workspace_id || '';
    if (!workspaceId) {
      setIsSaving(false);
      alert('Error: Active workspace context lost. Cannot save record.');
      return;
    }

    const validPhones = companyPhones.filter((p) => p.value.trim() !== '');
    const validEmails = companyEmails.filter((e) => e.value.trim() !== '');
    const validLinks = companyLinks.filter((l) => l.url.trim() !== '');

    const legacyPhones = validPhones.map((p) => ({ id: p.id, label: p.label, number: p.value, value: p.value }));
    const legacyEmails = validEmails.map((e) => ({ id: e.id, label: e.label, email: e.value, value: e.value }));

    const primaryPhoneVal = validPhones[0]?.value ? validPhones[0].value.trim() : '';
    const primaryEmailVal = validEmails[0]?.value ? validEmails[0].value.trim() : '';

    const computedCanonical = computeCanonicalName(displayName) || canonicalName.trim().toLowerCase();
    const searchTerms = generateCompanySearchTerms(displayName, city, legacyPhones.length > 0 ? legacyPhones : [{ number: primaryPhoneVal }]);

    const rawCompany: Omit<Company, 'id'> = {
      workspace_id: workspaceId,
      canonical_name: computedCanonical,
      legal_suffix: legalSuffix,
      display_name: displayName,
      aliases: aliasesArr,
      country: country.trim(),
      city: city.trim(),
      industry_parent: industryParent || undefined,
      business_type_raw: businessTypeRaw.trim() || undefined,
      industry_type: businessTypeRaw.trim() || undefined,
      industry: businessTypeRaw.trim() || undefined,
      links: validLinks,
      website: validLinks.find((l) => l.label === 'Website')?.url || '',
      general_phone: primaryPhoneVal,
      general_email: primaryEmailVal,
      phone: primaryPhoneVal,
      email: primaryEmailVal,
      general_phones: validPhones,
      general_emails: validEmails,
      phones: legacyPhones as any,
      emails: legacyEmails as any,
      restricted_lines: restrictedLines,
      relationship,
      temperature,
      is_dnc: temperature === 'DNC',
      notes: notes.trim(),
      search_terms: searchTerms,
      created_by_uid: targetCompany?.created_by_uid || user?.uid || '',
      created_by_name: targetCompany?.created_by_name || user?.full_name || user?.username || user?.email || 'User',
      last_modified_by_uid: user?.uid || '',
      last_modified_by_name: user?.full_name || user?.username || user?.email || 'User',
      createdAt: targetCompany?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (targetCompany && targetCompany.id) {
        const updatedComp: Company = { id: targetCompany.id, ...rawCompany };
        await safeUpdateDoc('companies', targetCompany.id, {
          ...rawCompany,
          restricted_lines: restrictedLines
        });
        await CompanyRepository.updateCompany(targetCompany.id, updatedComp);
        if (user) {
          await recordAuditLog({
            document_id: targetCompany.id,
            entity_type: 'company',
            entity_title: displayName,
            action: 'update',
            user: user,
            details: `Updated company "${displayName}"`
          });
        }

        if (setCompanies) {
          setCompanies((prev) => prev.map((c) => (c.id === targetCompany.id ? updatedComp : c)));
        }

        if (setCallLogs) {
          const newName = updatedComp.display_name || updatedComp.canonical_name;
          setCallLogs((prevLogs) =>
            prevLogs.map((log) =>
              log.company_id === targetCompany.id
                ? { ...log, company_name: newName, updatedAt: new Date().toISOString() }
                : log
            )
          );
        }

        if (triggerToast) {
          triggerToast(`Company "${displayName}" updated successfully`, 'success');
        }
        if (onSaved) {
          onSaved(updatedComp);
        }
      } else {
        const res = await safeAddDoc('companies', rawCompany);
        const newId = res?.id || 'comp_' + Date.now();
        const newComp: Company = { id: newId, ...rawCompany };
        await CompanyRepository.saveCompany(newComp);
        if (user) {
          await recordAuditLog({
            document_id: newId,
            entity_type: 'company',
            entity_title: displayName,
            action: 'create',
            user: user,
            details: `Created company "${displayName}"`
          });
        }

        if (setCompanies) {
          setCompanies((prev) => [newComp, ...prev]);
        }

        if (triggerToast) {
          triggerToast(`Company "${displayName}" added successfully`, 'success');
        }
        if (onSaved) {
          onSaved(newComp);
        }
      }

      onClose();
    } catch (err: any) {
      console.error('Save company failed:', err);
      if (triggerToast) {
        triggerToast(err.message || 'Failed to save company record', 'error');
      } else {
        alert(err.message || 'Failed to save company record');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="global-company-edit-modal-overlay"
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-[120] flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        id="global-company-edit-modal-card"
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl relative animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0 bg-slate-950/80 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-950/60 border border-indigo-800/60 rounded-xl text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 font-sans">
                {targetCompany ? 'Edit Company Profile' : 'Add New Company'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {targetCompany ? targetCompany.display_name : 'Universal Registry Account'}
              </p>
            </div>
            {canonicalName.trim() && (
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(canonicalName)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 px-2 py-0.5 bg-blue-900/50 hover:bg-blue-800 text-blue-300 border border-blue-700/50 rounded-md text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                title="Search Company on Google"
              >
                <Search className="w-3 h-3" />
                <span>Google Search</span>
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-200 transition p-1.5 rounded-lg hover:bg-slate-800/60 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 space-y-6">
            {/* Canonical Name & Legal Suffix */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  Canonical Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Veolia Water Solutions"
                  value={canonicalName}
                  onChange={(e) => setCanonicalName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  Legal Suffix
                </label>
                <select
                  value={legalSuffix}
                  onChange={(e) => setLegalSuffix(e.target.value as LegalSuffix)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans cursor-pointer"
                >
                  {['None / To Be Added Later', 'LLC', 'FZE', 'FZC', 'Co. LLC', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Aliases */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                Fuzzy Search Aliases (comma-separated)
              </label>
              <input
                type="text"
                placeholder="e.g. Veolia Water, Veolia Solutions, VWS"
                value={aliasesInput}
                onChange={(e) => setAliasesInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans"
              />
              <span className="text-[10px] text-slate-500 font-mono mt-1.5 block leading-normal">
                Search variants to match and block subsequent duplicates.
              </span>
            </div>

            {/* Duplicate Match Warning */}
            {duplicateMatchResult && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Potential Duplicate Account Detected</span>
                </div>
                <p className="text-xs text-slate-300">
                  A company matching "{duplicateMatchResult.target?.display_name || duplicateMatchResult.target?.canonical_name}" already exists ({duplicateMatchResult.matchReason}).
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPendingBypass(true);
                      setDuplicateMatchResult(null);
                    }}
                    className="text-xs px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-lg transition cursor-pointer"
                  >
                    Bypass & Save Anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateMatchResult(null)}
                    className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition cursor-pointer"
                  >
                    Review Name
                  </button>
                </div>
              </div>
            )}

            {/* City & Country */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  City <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sharjah"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  Country <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UAE"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans"
                />
              </div>
            </div>

            {/* Industry Taxonomy */}
            <IndustryTaxonomySelector
              parentSectorId={industryParent}
              onParentSectorChange={setIndustryParent}
              subTypeValue={businessTypeRaw}
              onSubTypeChange={setBusinessTypeRaw}
              userIdentifier={user?.email || user?.full_name || 'Operator'}
              variant="dark"
              size="md"
              idPrefix="edit-modal-ind"
              className="mb-1"
            />

            {/* Relationship & Temperature */}
            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  Relationship <span className="text-rose-400">*</span>
                </label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  className="w-full h-11 bg-slate-950 border border-slate-700 rounded-xl px-4 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans font-semibold cursor-pointer"
                >
                  {(companyRelationships.length > 0 ? companyRelationships : [
                    { id: 'rel_prospect', name: 'Prospect' },
                    { id: 'rel_customer', name: 'Customer' },
                    { id: 'rel_partner', name: 'Partner' },
                    { id: 'rel_vendor', name: 'Vendor' }
                  ]).map((r) => (
                    <option key={r.id} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                  Temperature
                </label>
                <select
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value as any)}
                  className="w-full h-11 bg-slate-950 border border-slate-700 rounded-xl px-4 text-sm text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans font-semibold cursor-pointer"
                >
                  <option value="Cold">Cold ❄️</option>
                  <option value="Warm">Warm 🌤️</option>
                  <option value="Hot">Hot 🔥</option>
                  <option value="DNC">DNC 🚫</option>
                </select>
              </div>
            </div>

            {/* Company Phones */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  Company Phone Numbers
                </label>
                <button
                  type="button"
                  onClick={() => setCompanyPhones((prev) => [...prev, { id: generateId(), label: 'Main', value: '' }])}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Phone</span>
                </button>
              </div>
              <datalist id="company-edit-phone-tags">
                <option value="Landline" />
                <option value="Main" />
                <option value="Reception" />
                <option value="Direct Line" />
                <option value="Mobile" />
                <option value="WhatsApp" />
                <option value="Fax" />
              </datalist>
              {companyPhones.map((ph, idx) => {
                const currentRestriction = getLineRestriction(restrictedLines, ph.value);

                return (
                  <div key={ph.id || idx} className="flex items-center space-x-2">
                    <input
                      list="company-edit-phone-tags"
                      value={ph.label}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompanyPhones((prev) => prev.map((item, i) => (i === idx ? { ...item, label: val } : item)));
                      }}
                      placeholder="Tag"
                      className="w-28 sm:w-32 px-3 py-2.5 text-xs border border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shrink-0"
                    />
                    <input
                      type="text"
                      placeholder="Phone number..."
                      value={ph.value}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCompanyPhones((prev) => prev.map((item, i) => (i === idx ? { ...item, value: val } : item)));
                      }}
                      className="flex-1 min-w-0 px-4 py-2.5 text-xs border border-slate-700 rounded-xl font-mono bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                    />

                    <button
                      type="button"
                      onClick={() => togglePhoneRestriction(ph.value)}
                      disabled={!ph.value.trim()}
                      className={`px-2.5 py-2.5 rounded-xl text-[10px] font-bold flex items-center gap-1 border transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 ${
                        currentRestriction === 'DNC'
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                          : currentRestriction === 'Invalid'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-300'
                      }`}
                      title={
                        currentRestriction === 'DNC'
                          ? 'Restriction: DNC (Click to Clear)'
                          : currentRestriction === 'Invalid'
                          ? 'Restriction: Invalid (Click for DNC)'
                          : 'Line Active (Click to flag Invalid)'
                      }
                    >
                      <ShieldAlert
                        className={`w-3.5 h-3.5 ${
                          currentRestriction === 'DNC'
                            ? 'text-rose-400'
                            : currentRestriction === 'Invalid'
                            ? 'text-amber-400'
                            : 'text-slate-500'
                        }`}
                      />
                      <span>{currentRestriction || 'Clear'}</span>
                    </button>

                    {companyPhones.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCompanyPhones((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/60 cursor-pointer shrink-0"
                        title="Remove Phone"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Company Emails */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  Company Email Addresses
                </label>
                <button
                  type="button"
                  onClick={() => setCompanyEmails((prev) => [...prev, { id: generateId(), label: 'Main', value: '' }])}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Email</span>
                </button>
              </div>
              <datalist id="company-edit-email-tags">
                <option value="Work" />
                <option value="Main" />
                <option value="Inquiries" />
                <option value="Sales" />
                <option value="Support" />
              </datalist>
              {companyEmails.map((em, idx) => (
                <div key={em.id || idx} className="flex items-center space-x-2">
                  <input
                    list="company-edit-email-tags"
                    value={em.label}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCompanyEmails((prev) => prev.map((item, i) => (i === idx ? { ...item, label: val } : item)));
                    }}
                    placeholder="Tag"
                    className="w-28 sm:w-32 px-3 py-2.5 text-xs border border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shrink-0"
                  />
                  <input
                    type="email"
                    placeholder="Email address..."
                    value={em.value}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCompanyEmails((prev) => prev.map((item, i) => (i === idx ? { ...item, value: val } : item)));
                    }}
                    className="flex-1 min-w-0 px-4 py-2.5 text-xs border border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                  {companyEmails.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCompanyEmails((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/60 cursor-pointer shrink-0"
                      title="Remove Email"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Links & Portals */}
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                  Company Links & Portals
                </label>
                <button
                  type="button"
                  onClick={() => setCompanyLinks((prev) => [...prev, { id: generateId(), label: 'Website', url: '' }])}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Link</span>
                </button>
              </div>
              <datalist id="company-edit-link-tags">
                <option value="Website" />
                <option value="LinkedIn" />
                <option value="Facebook" />
                <option value="Instagram" />
                <option value="Portal" />
              </datalist>
              {companyLinks.map((link, idx) => (
                <div key={link.id || idx} className="flex items-center space-x-2">
                  <input
                    list="company-edit-link-tags"
                    value={link.label}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCompanyLinks((prev) => prev.map((item, i) => (i === idx ? { ...item, label: val } : item)));
                    }}
                    placeholder="Tag (e.g. Website)"
                    className="w-28 sm:w-32 px-3 py-2.5 text-xs border border-slate-700 rounded-xl font-sans bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all shrink-0"
                  />
                  <input
                    type="url"
                    placeholder="https://..."
                    value={link.url}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCompanyLinks((prev) => prev.map((item, i) => (i === idx ? { ...item, url: val } : item)));
                    }}
                    className="flex-1 min-w-0 px-4 py-2.5 text-xs border border-slate-700 rounded-xl font-mono bg-slate-950 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                  {companyLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setCompanyLinks((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-400 hover:text-rose-400 transition rounded-lg hover:bg-slate-800/60 cursor-pointer shrink-0"
                      title="Remove Link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Internal Notes */}
            <div>
              <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1.5">
                Internal Notes
              </label>
              <textarea
                rows={3}
                placeholder="Provide any client profiles, special conditions..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-sans"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-slate-950/90 border-t border-slate-800 p-4 flex justify-end gap-3 shrink-0 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center space-x-2 cursor-pointer shadow-md"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{isSaving ? 'Saving Record...' : targetCompany ? 'Save Changes' : 'Create Company'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
