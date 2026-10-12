import React, { useState, useEffect, useMemo } from 'react';
import { Company, UserProfile, Workspace, LegalSuffix, ContactMethod } from '../../types';
import { safeAddDoc, safeUpdateDoc } from '../../firebase';
import { CompanyRepository } from '../../services/repositories/CompanyRepository';
import { recordAuditLog } from '../../utils/auditLogger';
import { computeCanonicalName, generateCompanySearchTerms } from '../../utils/defaults';
import { findDuplicateCompany } from '../../utils/fuzzyMatch';
import { getReferenceId } from '../../utils/refId';
import {
  Building2,
  X,
  AlertTriangle,
  Link2,
  Check,
  Loader2,
  Phone,
  Mail,
  MapPin,
  Globe,
  Tag,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

export interface CreateCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspace?: Workspace | null;
  user: UserProfile;
  companies: Company[];
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  initialName?: string;
  initialCity?: string;
  initialCountry?: string;
  onCompanyCreated?: (newCompany: Company) => void;
  onCompanyPaired?: (existingCompany: Company) => void;
  triggerToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

const LEGAL_SUFFIX_OPTIONS: { label: string; value: string }[] = [
  { label: 'None (Clean Name)', value: 'None' },
  { label: 'None / To Be Added Later', value: 'None / To Be Added Later' },
  { label: 'LLC', value: 'LLC' },
  { label: 'FZE', value: 'FZE' },
  { label: 'FZC', value: 'FZC' },
  { label: 'Co. LLC', value: 'Co. LLC' },
  { label: 'Ltd', value: 'Ltd' },
  { label: 'W.L.L.', value: 'W.L.L.' },
  { label: 'Est.', value: 'Est.' },
  { label: 'PJSC', value: 'PJSC' },
  { label: 'PrJSC', value: 'PrJSC' },
  { label: 'None / Other', value: 'None / Other' }
];

/**
 * Cleanly sanitizes company name and legal suffix.
 * If suffix is 'None', 'None / To Be Added Later', 'None / Other', or empty:
 * - legalSuffix is treated as undefined
 * - displayName is strictly the clean company name
 * If a valid suffix (e.g., 'LLC', 'FZE') is selected:
 * - Appends cleanly with a single whitespace without double-suffixing
 */
export function sanitizeCompanyNameAndSuffix(
  rawName: string,
  rawSuffix?: string | null
): { cleanName: string; legalSuffix?: LegalSuffix; displayName: string } {
  const cleanName = (rawName || '').trim();
  const normalizedSuffix = (rawSuffix || '').trim();

  const isNone =
    !normalizedSuffix ||
    /^(none|none\s*\/\s*to\s*be\s*added\s*later|none\s*\/\s*other)$/i.test(normalizedSuffix);

  if (isNone) {
    return {
      cleanName,
      legalSuffix: undefined,
      displayName: cleanName
    };
  }

  // Check if cleanName already ends with this suffix
  const suffixLower = normalizedSuffix.toLowerCase();
  const nameLower = cleanName.toLowerCase();
  const alreadyHasSuffix =
    nameLower.endsWith(` ${suffixLower}`) ||
    nameLower.endsWith(suffixLower);

  const displayName = alreadyHasSuffix ? cleanName : `${cleanName} ${normalizedSuffix}`;

  return {
    cleanName,
    legalSuffix: normalizedSuffix as LegalSuffix,
    displayName
  };
}

export const CreateCompanyModal: React.FC<CreateCompanyModalProps> = ({
  isOpen,
  onClose,
  activeWorkspace,
  user,
  companies,
  setCompanies,
  initialName = '',
  initialCity = '',
  initialCountry = 'UAE',
  onCompanyCreated,
  onCompanyPaired,
  triggerToast
}) => {
  const [canonicalName, setCanonicalName] = useState(initialName);
  const [legalSuffix, setLegalSuffix] = useState<string>('None / To Be Added Later');
  const [city, setCity] = useState(initialCity || 'Dubai');
  const [country, setCountry] = useState(initialCountry || 'UAE');
  const [industry, setIndustry] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [relationship, setRelationship] = useState('Prospect');
  const [temperature, setTemperature] = useState('Cold');

  // Duplicate Warning States
  const [duplicateMatch, setDuplicateMatch] = useState<Company | null>(null);
  const [duplicateMatchInfo, setDuplicateMatchInfo] = useState<{ similarity: number; reason: string } | null>(null);
  const [ignoredDuplicateIds, setIgnoredDuplicateIds] = useState<string[]>([]);
  const [isAddingAlias, setIsAddingAlias] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync initial values when modal opens
  useEffect(() => {
    if (isOpen) {
      setCanonicalName(initialName);
      setCity(initialCity || 'Dubai');
      setCountry(initialCountry || 'UAE');
      setLegalSuffix('None / To Be Added Later');
      setIndustry('');
      setPhone('');
      setEmail('');
      setWebsite('');
      setNotes('');
      setRelationship('Prospect');
      setTemperature('Cold');
      setDuplicateMatch(null);
      setDuplicateMatchInfo(null);
      setIgnoredDuplicateIds([]);
    }
  }, [isOpen, initialName, initialCity, initialCountry]);

  // Real-Time Duplicate Account Detection (250ms debounce)
  useEffect(() => {
    if (!isOpen) {
      setDuplicateMatch(null);
      setDuplicateMatchInfo(null);
      return;
    }

    const trimmed = canonicalName.trim();
    if (trimmed.length < 2) {
      setDuplicateMatch(null);
      setDuplicateMatchInfo(null);
      return;
    }

    const timer = setTimeout(() => {
      // 1. Direct exact or alias match check first
      const lower = trimmed.toLowerCase();
      const exactMatch = companies.find((c) => {
        if (c.canonical_name?.toLowerCase() === lower) return true;
        if (c.display_name?.toLowerCase() === lower) return true;
        if (Array.isArray(c.aliases) && c.aliases.some((a) => a.toLowerCase() === lower)) return true;
        return false;
      });

      if (exactMatch && !ignoredDuplicateIds.includes(exactMatch.id || '')) {
        setDuplicateMatch(exactMatch);
        setDuplicateMatchInfo({
          similarity: 1.0,
          reason: 'Exact name match'
        });
        return;
      }

      // 2. Fuzzy match detection
      const matchRes = findDuplicateCompany(trimmed, companies);
      if (matchRes && matchRes.match) {
        if (!ignoredDuplicateIds.includes(matchRes.match.id || '')) {
          setDuplicateMatch(matchRes.match);
          setDuplicateMatchInfo({
            similarity: matchRes.similarity,
            reason: matchRes.reason
          });
        } else {
          setDuplicateMatch(null);
          setDuplicateMatchInfo(null);
        }
      } else {
        setDuplicateMatch(null);
        setDuplicateMatchInfo(null);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [canonicalName, companies, ignoredDuplicateIds, isOpen]);

  if (!isOpen) return null;

  const currentWorkspaceId = activeWorkspace?.id || 'unassigned';

  // Quick-Pair Handler: Pair with existing matched company
  const handleQuickPair = (existingCompany: Company) => {
    if (onCompanyPaired) {
      onCompanyPaired(existingCompany);
    }
    if (triggerToast) {
      triggerToast(`Paired with existing account "${existingCompany.display_name || existingCompany.canonical_name}"`, 'success');
    }
    onClose();
  };

  // Add current input as alias to matched company and pair
  const handleAddAsAliasAndPair = async () => {
    if (!duplicateMatch || !duplicateMatch.id) return;
    const nameToAdd = canonicalName.trim();
    if (!nameToAdd) return;

    setIsAddingAlias(true);
    try {
      const currentAliases = Array.isArray(duplicateMatch.aliases) ? [...duplicateMatch.aliases] : [];
      if (!currentAliases.some((a) => a.toLowerCase() === nameToAdd.toLowerCase())) {
        currentAliases.push(nameToAdd);
      }

      const updatedData: Partial<Company> = {
        aliases: currentAliases,
        updatedAt: new Date().toISOString(),
        last_modified_by_uid: user?.uid || '',
        last_modified_by_name: user?.full_name || user?.username || user?.email || 'User'
      };

      await safeUpdateDoc('companies', duplicateMatch.id, updatedData);
      await CompanyRepository.updateCompany(duplicateMatch.id, updatedData);

      const updatedCompany: Company = {
        ...duplicateMatch,
        ...updatedData
      };

      if (setCompanies) {
        setCompanies((prev) =>
          prev.map((c) => (c.id === duplicateMatch.id ? updatedCompany : c))
        );
      }

      try {
        await recordAuditLog({
          document_id: duplicateMatch.id,
          entity_type: 'company',
          entity_title: duplicateMatch.display_name || duplicateMatch.canonical_name,
          action: 'update',
          user,
          after: { aliases: currentAliases },
          details: `Added alias "${nameToAdd}" and paired account`
        });
      } catch (aErr) {
        console.warn('Audit log error on alias add:', aErr);
      }

      if (triggerToast) {
        triggerToast(`Added "${nameToAdd}" as alias and paired with "${duplicateMatch.display_name}"`, 'success');
      }

      if (onCompanyPaired) {
        onCompanyPaired(updatedCompany);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to add alias:', err);
      alert('Failed to add alias: ' + err.message);
    } finally {
      setIsAddingAlias(false);
    }
  };

  const handleDismissWarning = () => {
    if (!duplicateMatch || !duplicateMatch.id) return;
    setIgnoredDuplicateIds((prev) => [...prev, duplicateMatch.id!]);
    setDuplicateMatch(null);
    setDuplicateMatchInfo(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canonicalName.trim()) return;

    setIsSubmitting(true);
    try {
      // 1. Sanitize legal suffix and compute clean display name
      const { cleanName, legalSuffix: cleanSuffix, displayName } = sanitizeCompanyNameAndSuffix(
        canonicalName,
        legalSuffix
      );

      const computedCanonical = computeCanonicalName(displayName) || cleanName.toLowerCase();
      const searchTerms = generateCompanySearchTerms(displayName, city, phone ? [{ number: phone }] : []);

      const validPhones: ContactMethod[] = phone.trim()
        ? [{ id: `cm_${Date.now()}_p`, label: 'Main', value: phone.trim() }]
        : [];
      const validEmails: ContactMethod[] = email.trim()
        ? [{ id: `cm_${Date.now()}_e`, label: 'Main', value: email.trim() }]
        : [];

      // Dual-field workspace keys: workspace_id AND workspaceId for strict isolation
      const newCompanyPayload: Omit<Company, 'id'> = {
        workspace_id: currentWorkspaceId,
        workspaceId: currentWorkspaceId,
        canonical_name: computedCanonical,
        legal_suffix: cleanSuffix || undefined,
        display_name: displayName,
        aliases: [cleanName],
        country: country.trim() || 'UAE',
        city: city.trim() || 'Dubai',
        industry: industry.trim() || undefined,
        industry_type: industry.trim() || undefined,
        general_phone: phone.trim() || undefined,
        general_email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        general_phones: validPhones,
        general_emails: validEmails,
        phones: validPhones as any,
        emails: validEmails as any,
        website: website.trim() || undefined,
        notes: notes.trim() || undefined,
        relationship: relationship || 'Prospect',
        temperature: temperature || 'Cold',
        is_dnc: temperature === 'DNC',
        search_terms: searchTerms,
        created_by_uid: user?.uid || '',
        created_by_name: user?.full_name || user?.username || user?.email || 'User',
        last_modified_by_uid: user?.uid || '',
        last_modified_by_name: user?.full_name || user?.username || user?.email || 'User',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const res = await safeAddDoc('companies', newCompanyPayload);
      const newId = res?.id || `comp_${Date.now()}`;
      const createdCompany: Company = { id: newId, ...newCompanyPayload };

      await CompanyRepository.saveCompany(createdCompany);

      try {
        await recordAuditLog({
          document_id: newId,
          entity_type: 'company',
          entity_title: createdCompany.display_name,
          action: 'create',
          user,
          after: newCompanyPayload,
          details: `Created company catalog account "${createdCompany.display_name}"`
        });
      } catch (aErr) {
        console.warn('Audit log error on company create:', aErr);
      }

      if (setCompanies) {
        setCompanies((prev) => [createdCompany, ...prev.filter((c) => c.id !== newId)]);
      }

      if (triggerToast) {
        triggerToast(`Company "${createdCompany.display_name}" created successfully`, 'success');
      }

      if (onCompanyCreated) {
        onCompanyCreated(createdCompany);
      }

      onClose();
    } catch (err: any) {
      console.error('Error creating company:', err);
      alert('Failed to create company: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview computed display name in real-time
  const preview = useMemo(() => {
    return sanitizeCompanyNameAndSuffix(canonicalName, legalSuffix);
  }, [canonicalName, legalSuffix]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center border border-blue-200">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 font-sans">
                Create New Company Account
              </h3>
              <p className="text-xs text-slate-500 font-sans">
                Add an enterprise account to your workspace directory
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Company Name & Legal Suffix Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
            <div className="sm:col-span-7">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                Company Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rafael Hotel"
                value={canonicalName}
                onChange={(e) => setCanonicalName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans"
              />
            </div>
            <div className="sm:col-span-5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                Legal Suffix
              </label>
              <select
                value={legalSuffix}
                onChange={(e) => setLegalSuffix(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans cursor-pointer truncate"
              >
                {LEGAL_SUFFIX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Sanitized Live Preview Tag */}
          {canonicalName.trim() && (
            <div className="flex items-center space-x-2 text-xs bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg">
              <span className="text-slate-400 font-medium shrink-0">Catalog Display Name:</span>
              <span className="font-semibold text-slate-800 font-mono truncate">
                {preview.displayName}
              </span>
              {preview.legalSuffix ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-mono shrink-0">
                  Suffix: {preview.legalSuffix}
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-mono shrink-0">
                  Clean (No Suffix)
                </span>
              )}
            </div>
          )}

          {/* Real-Time Duplicate Warning Alert Card */}
          {duplicateMatch && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Possible Duplicate Account Detected
                  </span>
                </div>
                {duplicateMatchInfo?.similarity !== undefined && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-mono">
                    {Math.round(duplicateMatchInfo.similarity * 100)}% match
                  </span>
                )}
              </div>

              {/* Matched Company Details */}
              <div className="p-3 bg-white/80 rounded-lg border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center space-x-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">
                      {duplicateMatch.display_name || duplicateMatch.canonical_name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                      {getReferenceId('CMP', duplicateMatch, companies)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 flex items-center space-x-3 mt-1">
                    <span className="flex items-center space-x-1">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{duplicateMatch.city || 'Dubai'}, {duplicateMatch.country || 'UAE'}</span>
                    </span>
                    {duplicateMatch.general_phone && (
                      <span className="flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{duplicateMatch.general_phone}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex items-center flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleQuickPair(duplicateMatch)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Pair with Existing Account</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddAsAliasAndPair}
                  disabled={isAddingAlias}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isAddingAlias ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                  <span>Add as Alias & Pair</span>
                </button>

                <button
                  type="button"
                  onClick={handleDismissWarning}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-amber-100/60 rounded-lg transition cursor-pointer ml-auto"
                >
                  Dismiss / Create Distinct
                </button>
              </div>
            </div>
          )}

          {/* Location & Industry Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                City / Location
              </label>
              <input
                type="text"
                placeholder="e.g. Dubai, Abu Dhabi, Sharjah"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                Country
              </label>
              <input
                type="text"
                placeholder="e.g. UAE, Saudi Arabia, Qatar"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans"
              />
            </div>
          </div>

          {/* Contact Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                General Phone
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="+971 4 123 4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                General Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  placeholder="info@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans"
                />
              </div>
            </div>
          </div>

          {/* Relationship & Temperature */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                Relationship
              </label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans cursor-pointer"
              >
                <option value="Prospect">Prospect</option>
                <option value="Client">Client</option>
                <option value="Vendor / Supplier">Vendor / Supplier</option>
                <option value="Partner">Partner</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                Temperature
              </label>
              <select
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans cursor-pointer"
              >
                <option value="Cold">Cold</option>
                <option value="Warm">Warm</option>
                <option value="Hot">Hot</option>
                <option value="DNC">DNC (Do Not Call)</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
              Internal Notes
            </label>
            <textarea
              rows={2}
              placeholder="Key account background, procurement practices, trade terms..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 placeholder-slate-400 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition font-sans"
            />
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !canonicalName.trim()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs flex items-center space-x-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4" />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCompanyModal;
