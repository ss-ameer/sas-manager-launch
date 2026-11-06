import React from 'react';
import CompanyModal from './CompanyModal';
import { formatSubTypeName, getParentIndustry, IndustryBadge } from '../utils/taxonomy';
import CompanyDetailView, {
  CompanyDetailDrawer,
  DETAIL_HEADER_CLASSES,
  DETAIL_EMPTY_FALLBACK_CLASSES,
  DETAIL_EMPTY_CONTAINER_CLASSES,
  EmptyDetailField
} from './CompanyDetailView';
import {
  Company,
  Contact,
  Enquiry,
  getContactPhones,
  getContactEmails,
  getCompanyPhones,
  getCompanyEmails
} from '../types';
import { getReferenceId } from '../utils/refId';
import GoogleSearchButton from './common/GoogleSearchButton';
import { PhoneCall, Building2, Edit, Trash2, Search, RotateCcw, Users2, Plus, Phone } from 'lucide-react';
import {
  formatRelativeOutreachDate,
  CompanyOutreachSummary,
  OutreachCadence
} from '../utils/activityLogic';
import { cycleCompanyTemperature } from '../utils/temperatureCycle';

export {
  formatSubTypeName,
  CompanyDetailView,
  CompanyDetailDrawer,
  EmptyDetailField,
  DETAIL_HEADER_CLASSES,
  DETAIL_EMPTY_FALLBACK_CLASSES,
  DETAIL_EMPTY_CONTAINER_CLASSES
};

/**
 * Formats company sub-type for Table and Card view display in Companies Registry
 */
export const formatCompanySubType = (company?: { subType?: string; business_type_raw?: string } | null) => {
  if (!company) return '';
  return formatSubTypeName(company.subType || company.business_type_raw);
};

export const TABLE_FALLBACK_TEXT_CLASSES = "text-xs font-medium text-slate-600 dark:text-slate-300 not-italic";
export const TABLE_HEADER_TEXT_CLASSES = "text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200";
export const ACTION_PILL_BUTTON_CLASSES = "border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-200 transition-colors shadow-xs";

export interface SearchMatchHint {
  type: 'contact' | 'notes';
  label?: string; // Contact name or note context
}

export interface CompanySearchMatchResult {
  matched: boolean;
  matchHint?: SearchMatchHint | null;
}

/**
 * Normalizes phone numbers to compare digits safely across international (+971) and local (05...) formats.
 * e.g., '054204' reliably matches '054 204 0848' or '+971 54 204 0848'.
 */
export function matchesNormalizedPhone(
  phoneCandidate?: string | null,
  textQuery?: string,
  digitsQuery?: string
): boolean {
  if (!phoneCandidate) return false;
  const trimmed = String(phoneCandidate).trim();
  if (!trimmed) return false;

  // 1. Literal text inclusion
  if (textQuery && trimmed.toLowerCase().includes(textQuery)) {
    return true;
  }

  // 2. Normalized digits comparison
  if (digitsQuery && digitsQuery.length > 0) {
    const candDigits = trimmed.replace(/\D/g, '');
    if (!candDigits) return false;

    // Substring match of digits
    if (candDigits.includes(digitsQuery)) {
      return true;
    }

    // If query starts with 0 (e.g. 054204), check without leading zero (54204)
    const queryNoLeadingZero = digitsQuery.replace(/^0+/, '');
    if (queryNoLeadingZero.length >= 3 && candDigits.includes(queryNoLeadingZero)) {
      return true;
    }

    // If phone candidate starts with 971 (UAE code) and query starts with 0
    const candLocal = candDigits.replace(/^971/, '0');
    if (candLocal.includes(digitsQuery)) {
      return true;
    }

    // If candidate starts with 971 and query has no leading zero
    const candNoLeadingZero = candDigits.replace(/^971|^0+/, '');
    if (candNoLeadingZero.length >= 3 && (candNoLeadingZero.includes(digitsQuery) || digitsQuery.includes(candNoLeadingZero))) {
      return true;
    }
  }

  return false;
}

/**
 * Deep, fault-tolerant search evaluator for a company against an omni-search query.
 * Matches across:
 * - Canonical name, Ref ID (CMP-XXXX), aliases
 * - City, Country / Jurisdiction
 * - Company Phone directory & Emails
 * - Contact Personnel (Name, Title/Role, Email, Mobile, Landline)
 * - Internal Company Notes
 *
 * Provides a context hint badge when matched via Contact or Notes.
 */
export function evaluateCompanySearch(
  c: Company,
  rawQuery: string,
  companies: Company[],
  contacts: Contact[]
): CompanySearchMatchResult {
  const trimmedQuery = (rawQuery || '').trim();
  if (!trimmedQuery) {
    return { matched: true, matchHint: null };
  }

  const q = trimmedQuery.toLowerCase();
  const digitsQuery = trimmedQuery.replace(/\D/g, '');

  const refId = getReferenceId('CMP', c, companies).toLowerCase();
  const idStr = (c.id || '').toLowerCase();
  const canonicalName = (c.canonical_name || '').toLowerCase();
  const displayName = (c.display_name || '').toLowerCase();
  const companyCode = (c.company_code || '').toLowerCase();
  const countryCode = (c.country_code || '').toLowerCase();
  const aliases = Array.isArray(c.aliases) ? c.aliases : [];

  // 1. Direct Name / Alias / RefID / Company Code Match (No hint needed - direct match)
  const matchedNameOrAlias =
    refId.includes(q) ||
    idStr.includes(q) ||
    canonicalName.includes(q) ||
    displayName.includes(q) ||
    (companyCode && companyCode.includes(q)) ||
    (countryCode && countryCode.includes(q)) ||
    aliases.some((a) => a?.toLowerCase?.().includes(q));

  if (matchedNameOrAlias) {
    return { matched: true, matchHint: null };
  }

  // 2. Direct Company Metadata Match (City, Country, Industry, direct phones/emails)
  const city = (c.city || '').toLowerCase();
  const country = (c.country || '').toLowerCase();
  const industryParent = (c.industry_parent || '').toLowerCase();
  const businessTypeRaw = (c.business_type_raw || (c as any).subType || '').toLowerCase();
  const industry = (c.industry || '').toLowerCase();
  const industryType = (c.industry_type || '').toLowerCase();
  const relationship = (c.relationship || '').toLowerCase();
  const temperature = (c.temperature || '').toLowerCase();

  const companyPhones = getCompanyPhones(c);
  const companyEmails = getCompanyEmails(c);

  const matchedDirectCompany =
    city.includes(q) ||
    country.includes(q) ||
    industryParent.includes(q) ||
    businessTypeRaw.includes(q) ||
    industry.includes(q) ||
    industryType.includes(q) ||
    relationship.includes(q) ||
    temperature.includes(q) ||
    matchesNormalizedPhone(c.general_phone, q, digitsQuery) ||
    matchesNormalizedPhone(c.phone, q, digitsQuery) ||
    companyPhones.some((p) => matchesNormalizedPhone(p.number || p.value, q, digitsQuery)) ||
    (c.general_email && c.general_email.toLowerCase().includes(q)) ||
    (c.email && c.email.toLowerCase().includes(q)) ||
    companyEmails.some((e) => (e.email || e.value)?.toLowerCase?.().includes(q));

  if (matchedDirectCompany) {
    return { matched: true, matchHint: null };
  }

  // 3. Contact Personnel Match (High Specificity - returns Contact hint)
  const linkedContacts = (contacts || []).filter(
    (ct) => ct && ct.company_id === c.id && !ct.is_deleted
  );
  const embeddedContacts = Array.isArray((c as any).contacts) ? (c as any).contacts : [];
  const allContacts = [...linkedContacts, ...embeddedContacts];

  for (const ct of allContacts) {
    if (!ct) continue;
    const contactName = (ct.full_name || '').toLowerCase();
    const contactRole = (
      ct.designation ||
      (ct as any).role ||
      (ct as any).title ||
      ct.department ||
      ''
    ).toLowerCase();
    const contactEmail = (ct.email || '').toLowerCase();
    const ctPhones = getContactPhones(ct);
    const ctEmails = getContactEmails(ct);

    const contactMatched =
      contactName.includes(q) ||
      contactRole.includes(q) ||
      contactEmail.includes(q) ||
      ctEmails.some((e) => (e.email || e.value)?.toLowerCase?.().includes(q)) ||
      matchesNormalizedPhone(ct.mobile, q, digitsQuery) ||
      matchesNormalizedPhone(ct.landline, q, digitsQuery) ||
      ctPhones.some((p) => matchesNormalizedPhone(p.number || p.value, q, digitsQuery));

    if (contactMatched) {
      return {
        matched: true,
        matchHint: {
          type: 'contact',
          label: ct.full_name || 'Contact'
        }
      };
    }
  }

  // 4. Internal Notes Match (Returns Notes hint)
  const companyNotes = (
    (c as any).internalNotes ||
    (c as any).internal_notes ||
    c.notes ||
    ''
  ).toLowerCase();

  if (companyNotes.includes(q)) {
    return {
      matched: true,
      matchHint: {
        type: 'notes',
        label: 'Matched in Company Notes'
      }
    };
  }

  return { matched: false, matchHint: null };
}

/**
 * Micro-badge rendered under the company row or card when matched outside canonical name/alias.
 */
export const CompanySearchMatchHint: React.FC<{ matchHint?: SearchMatchHint | null }> = ({
  matchHint
}) => {
  if (!matchHint) return null;
  return (
    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded inline-flex items-center gap-1 mt-1">
      {matchHint.type === 'contact' ? (
        <>
          <span>👤</span>
          <span>
            Contact: <strong className="text-slate-700 dark:text-slate-200">{matchHint.label}</strong>
          </span>
        </>
      ) : (
        <>
          <span>📝</span>
          <span>Matched in Company Notes</span>
        </>
      )}
    </span>
  );
};

/**
 * Subtle muted indicator rendered when a company lacks an assigned industry or business sector.
 */
export const UnassignedIndustryPill: React.FC<{ className?: string }> = ({
  className = ''
}) => (
  <span
    className={`text-xs text-slate-400 dark:text-slate-500 select-none ${className}`}
  >
    —
  </span>
);

export interface CompaniesDirectoryTableProps {
  paginatedCompanies: Company[];
  companies: Company[];
  contacts: Contact[];
  enquiries: Enquiry[];
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string) => void;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  searchQuery: string;
  searchEvaluationMap: Map<string, CompanySearchMatchResult>;
  companyOutreachMap: Map<string, CompanyOutreachSummary>;
  paginationFooter?: React.ReactNode;
}

/**
 * Standardized 2-line B2B SaaS Companies Directory Table with sticky opaque header and table-fixed layout.
 */
export const CompaniesDirectoryTable: React.FC<CompaniesDirectoryTableProps> = ({
  paginatedCompanies,
  companies,
  contacts,
  enquiries,
  selectedCompanyId,
  setSelectedCompanyId,
  setCompanies,
  searchQuery,
  searchEvaluationMap,
  companyOutreachMap,
  paginationFooter
}) => {
  return (
    <div className="w-full overflow-x-clip relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
      <table className="w-full table-fixed text-left text-xs border-collapse font-sans">
        <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
          <tr>
            <th className="py-3 px-3.5 w-[9%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Ref ID</th>
            <th className="py-3 px-3.5 w-[26%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Company & Location</th>
            <th className="py-3 px-3.5 w-[18%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Industry / Type</th>
            <th className="py-3 px-3.5 w-[13%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Relationship</th>
            <th className="py-3 px-3.5 w-[16%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Contact Details</th>
            <th className="py-3 px-3.5 w-[10%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Activity</th>
            <th className="py-3 px-3.5 w-[105px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {paginatedCompanies.map((c) => {
            const isSelected = selectedCompanyId === c.id;
            const linkCount = enquiries.filter((e) => e.company_id === c.id).length;
            const relVal = c.relationship || 'Prospect';
            const phones = getCompanyPhones(c);
            const emails = getCompanyEmails(c);
            const matchResult =
              (c.id ? searchEvaluationMap.get(c.id) : null) ||
              evaluateCompanySearch(c, searchQuery, companies, contacts);
            const matchHint = matchResult.matchHint;
            const outreach = (c.id ? companyOutreachMap.get(c.id) : null) || {
              lastContactedAt: null,
              lastContactedDateStr: null,
              lastContactedChannel: null,
              totalCompletedTouches: 0,
              totalCalls: 0,
              outreachCadence: 'never' as OutreachCadence
            };

            const rawSubType = formatSubTypeName(
              (c as any).subType || c.business_type_raw || c.industry || c.industry_type
            );
            const isValidSubType = Boolean(
              rawSubType &&
                !/^none$/i.test(rawSubType) &&
                !/to be added later/i.test(rawSubType) &&
                !/^unspecified$/i.test(rawSubType)
            );
            const parentIndustryObj = c.industry_parent
              ? getParentIndustry(c.industry_parent)
              : undefined;
            const hasIndustry = Boolean(isValidSubType || parentIndustryObj);

            const relToneClass =
              relVal === 'Client'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                : relVal === 'Vendor' || relVal === 'Supplier'
                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                : relVal === 'Our Company'
                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800'
                : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';

            const effectiveDnc = Boolean(
              c.is_dnc || (c as any).dnc || c.temperature === 'DNC'
            );
            const rawTemp = effectiveDnc ? 'DNC' : c.temperature || 'Cold';
            const tempNorm =
              rawTemp.toLowerCase() === 'dnc'
                ? 'DNC'
                : rawTemp.toLowerCase() === 'hot'
                ? 'Hot'
                : rawTemp.toLowerCase() === 'warm'
                ? 'Warm'
                : 'Cold';
            const tempDotClass =
              tempNorm === 'DNC'
                ? 'bg-rose-600'
                : tempNorm === 'Hot'
                ? 'bg-rose-500'
                : tempNorm === 'Warm'
                ? 'bg-amber-500'
                : 'bg-sky-400';

            return (
              <tr
                key={c.id}
                onClick={() => setSelectedCompanyId(c.id!)}
                className={`cursor-pointer border-l-2 transition-colors group ${
                  isSelected
                    ? 'border-l-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-l-transparent hover:border-l-blue-500 hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                }`}
              >
                {/* 1. REF ID */}
                <td className="py-2.5 px-3.5 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap truncate align-middle">
                  {getReferenceId('CMP', c, companies)}
                </td>

                {/* 2. COMPANY & LOCATION (Max 2 Lines) */}
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate"
                      title={c.display_name}
                    >
                      {c.display_name}
                    </span>
                    {c.company_code && (
                      <span className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 uppercase shrink-0 leading-none">
                        {c.company_code}
                      </span>
                    )}
                    {c.isInternalCompany && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0 leading-none">
                        <span>Our Company</span>
                      </span>
                    )}
                    <GoogleSearchButton
                      companyName={c.display_name}
                      location={c.city}
                      size="xs"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 flex items-center gap-1.5 min-w-0">
                    <span className="truncate">
                      📍 {c.city || 'Unknown City'}, {c.country || 'UAE'}
                    </span>
                    {matchHint && (
                      <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.2 rounded truncate shrink-0">
                        {matchHint.type === 'contact'
                          ? `👤 ${matchHint.label}`
                          : '📝 Notes'}
                      </span>
                    )}
                  </div>
                </td>

                {/* 3. INDUSTRY / TYPE */}
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  {hasIndustry ? (
                    <div className="truncate max-w-full">
                      <IndustryBadge
                        company={{
                          ...c,
                          business_type_raw: isValidSubType
                            ? rawSubType
                            : parentIndustryObj?.label || ''
                        }}
                        className="max-w-full truncate"
                      />
                    </div>
                  ) : (
                    <UnassignedIndustryPill />
                  )}
                </td>

                {/* 4. RELATIONSHIP (Max 2 Lines: Pill + Quiet 6px Dot Temp) */}
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  <div className="flex flex-col items-start gap-1 min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-medium border truncate max-w-full leading-tight ${relToneClass}`}
                    >
                      {relVal}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (c.id) {
                          cycleCompanyTemperature(
                            c.id,
                            c.temperature || 'Cold',
                            effectiveDnc,
                            {
                              companies,
                              setCompanies
                            }
                          );
                        }
                      }}
                      title={`Account temperature: ${tempNorm} (Click to cycle)`}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition truncate max-w-full cursor-pointer"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${tempDotClass}`}
                      />
                      <span className="truncate">{tempNorm}</span>
                    </button>
                  </div>
                </td>

                {/* 5. CONTACT DETAILS (Max 2 Lines or Single Quiet Fallback) */}
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  {phones.length === 0 && emails.length === 0 ? (
                    <div className="text-xs text-slate-400 dark:text-slate-500 italic truncate">
                      No contact info
                    </div>
                  ) : (
                    <div className="flex flex-col min-w-0">
                      {phones.length > 0 && (
                        <div
                          className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate font-mono"
                          title={phones[0].number}
                        >
                          {phones[0].number}
                        </div>
                      )}
                      {emails.length > 0 && (
                        <div
                          className={`text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono ${
                            phones.length > 0 ? 'mt-0.5' : ''
                          }`}
                          title={emails[0].email}
                        >
                          {emails[0].email}
                        </div>
                      )}
                    </div>
                  )}
                </td>

                {/* 6. ACTIVITY (Max 2 Lines) */}
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  <div className="flex flex-col min-w-0">
                    <div
                      className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate"
                      title={
                        outreach.outreachCadence === 'never' ||
                        !outreach.lastContactedAt
                          ? 'No completed outreach or activity logs found for this account'
                          : `Last contacted on ${new Date(
                              outreach.lastContactedAt
                            ).toLocaleString()}${
                              outreach.lastContactedChannel
                                ? ` via ${outreach.lastContactedChannel}`
                                : ''
                            }`
                      }
                    >
                      {outreach.outreachCadence === 'never' ||
                      !outreach.lastContactedAt
                        ? 'Never Contacted'
                        : formatRelativeOutreachDate(outreach.lastContactedAt)}
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                      {outreach.totalCalls} Calls · {linkCount} Enquiries
                    </div>
                  </div>
                </td>

                {/* 7. ACTION */}
                <td className="py-2.5 px-3.5 w-[105px] text-right whitespace-nowrap align-middle">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCompanyId(c.id!);
                    }}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs transition inline-flex items-center justify-center cursor-pointer"
                  >
                    {isSelected ? 'Inspecting' : 'Inspect'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {paginationFooter}
    </div>
  );
};

export interface ContactsDirectoryTableProps {
  paginatedContacts: Array<Contact & { companyName?: string; location?: string }>;
  filteredContacts: Array<Contact & { companyName?: string; location?: string }>;
  isContactMarkingMode: boolean;
  selectedContactIds: string[];
  handleSelectAllContacts: () => void;
  handleToggleSelectContact: (id: string) => void;
  setSelectedContactDetail: (ct: any) => void;
  handleInitiate: (payload: any) => void;
  setSelectedCompanyId: (id: string) => void;
  setViewMode: (mode: 'companies' | 'contacts' | 'phones') => void;
  isEditable: boolean;
  setContactToEdit: (ct: Contact | null) => void;
  setSelectedCompanyForContact: (id: string) => void;
  setContactModalOpen: (open: boolean) => void;
  handleDeleteContact: (id: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCompanyId: string | null;
  paginationFooter?: React.ReactNode;
}

/**
 * Standardized 2-line B2B SaaS People & Contacts Sub-Tab Table with sticky opaque header and table-fixed layout.
 */
export const ContactsDirectoryTable: React.FC<ContactsDirectoryTableProps> = ({
  paginatedContacts,
  filteredContacts,
  isContactMarkingMode,
  selectedContactIds,
  handleSelectAllContacts,
  handleToggleSelectContact,
  setSelectedContactDetail,
  handleInitiate,
  setSelectedCompanyId,
  setViewMode,
  isEditable,
  setContactToEdit,
  setSelectedCompanyForContact,
  setContactModalOpen,
  handleDeleteContact,
  searchQuery,
  setSearchQuery,
  selectedCompanyId,
  paginationFooter
}) => {
  return (
    <div className="w-full overflow-x-clip relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
      <table className="w-full table-fixed text-left border-collapse text-xs font-sans">
        <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
          <tr>
            {isContactMarkingMode && (
              <th className="py-3 px-2 w-9 text-center bg-slate-50 dark:bg-slate-900">
                <input
                  type="checkbox"
                  checked={filteredContacts.length > 0 && filteredContacts.every((c) => c.id && selectedContactIds.includes(c.id))}
                  onChange={handleSelectAllContacts}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                  title="Select/Deselect All Filtered Contacts"
                />
              </th>
            )}
            <th className="py-3 px-3.5 w-[23%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Contact &amp; Role</th>
            <th className="py-3 px-3.5 w-[22%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Company &amp; Location</th>
            <th className="py-3 px-3.5 w-[14%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Mobile Phone</th>
            <th className="py-3 px-3.5 w-[12%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Landline</th>
            <th className="py-3 px-3.5 w-[18%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Email Address</th>
            <th className="py-3 px-3.5 w-[120px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {paginatedContacts.map((ct) => {
            const isContactSelected = Boolean(isContactMarkingMode && ct.id && selectedContactIds.includes(ct.id));
            return (
              <tr
                key={ct.id}
                onClick={() => setSelectedContactDetail(ct)}
                className={`border-l-2 transition-colors group cursor-pointer ${
                  isContactSelected
                    ? 'border-l-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                    : 'border-l-transparent hover:border-l-blue-500 hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                }`}
              >
                {isContactMarkingMode && (
                  <td className="py-2.5 px-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isContactSelected}
                      onChange={() => ct.id && handleToggleSelectContact(ct.id)}
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>
                )}
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate" title={ct.full_name}>
                      {ct.full_name}
                    </span>
                    {ct.is_primary && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 shrink-0 leading-none">
                        Primary
                      </span>
                    )}
                    {ct.is_dnc && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800 shrink-0 leading-none">
                        DNC
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {ct.designation || '—'}
                  </div>
                </td>
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs truncate" title={ct.companyName}>
                    {ct.companyName}
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                    📍 {ct.location || 'UAE'}
                  </div>
                </td>
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  {ct.mobile ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        handleInitiate({
                          companyId: ct.company_id,
                          companyName: ct.companyName,
                          contactId: ct.id,
                          contactName: ct.full_name,
                          contact: ct,
                          targetType: 'contact',
                          contactPhone: ct.mobile,
                          channel: 'Call',
                          externalUrl: `tel:${ct.mobile}`,
                          e
                        });
                      }}
                      className="font-mono text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline inline-flex items-center gap-1 max-w-full truncate cursor-pointer"
                      title={ct.mobile}
                    >
                      <PhoneCall className="w-3 h-3 text-blue-500 shrink-0" />
                      <span className="truncate">{ct.mobile}</span>
                    </button>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 text-xs select-none">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  {ct.landline ? (
                    <span className="font-mono text-slate-700 dark:text-slate-300 font-medium text-xs truncate block" title={ct.landline}>
                      {ct.landline}
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 text-xs select-none">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  {ct.email ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        handleInitiate({
                          companyId: ct.company_id,
                          companyName: ct.companyName,
                          contactId: ct.id,
                          contactName: ct.full_name,
                          contact: ct,
                          targetType: 'contact',
                          contactEmail: ct.email,
                          channel: 'Email',
                          externalUrl: `mailto:${ct.email}`,
                          e
                        });
                      }}
                      className="text-slate-700 dark:text-slate-300 hover:text-blue-600 hover:underline font-mono text-[11px] cursor-pointer text-left truncate block max-w-full"
                      title={ct.email}
                    >
                      {ct.email}
                    </button>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500 text-xs select-none">—</span>
                  )}
                </td>
                <td className="py-2.5 px-3.5 w-[120px] text-right whitespace-nowrap align-middle">
                  <div className="inline-flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {ct.company_id && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCompanyId(ct.company_id!);
                          setViewMode('companies');
                        }}
                        title="View Assigned Company"
                        className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs transition inline-flex items-center justify-center cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isEditable && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setContactToEdit(ct);
                            setContactModalOpen(true);
                          }}
                          className="w-7 h-7 rounded-lg bg-blue-50/70 hover:bg-blue-100/80 text-blue-700 border border-blue-200/80 transition inline-flex items-center justify-center cursor-pointer"
                          title="Edit Contact"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteContact(ct.id!)}
                          className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition inline-flex items-center justify-center cursor-pointer"
                          title="Delete Contact"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}

          {filteredContacts.length === 0 && (
            <tr>
              <td colSpan={7} className="py-12 px-4 text-center">
                {searchQuery.trim() ? (
                  <div className="max-w-md mx-auto space-y-2.5">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                      <Search className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      No contacts match &ldquo;{searchQuery.trim()}&rdquo;
                    </p>
                    <p className="text-xs text-slate-500">
                      Try searching by another name, role, company, or phone number.
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Clear Search / Reset Filters</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md mx-auto space-y-2.5">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200/60 flex items-center justify-center mx-auto">
                      <Users2 className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      No contacts registered in this workspace yet
                    </p>
                    <p className="text-xs text-slate-500">
                      Add key decision makers, engineers, and procurement contacts linked to your corporate accounts.
                    </p>
                    {isEditable && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setContactToEdit(null);
                            setSelectedCompanyForContact(selectedCompanyId || '');
                            setContactModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white hover:bg-blue-700 shadow-2xs transition cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add First Contact</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {paginationFooter}
    </div>
  );
};

export interface PhonesDirectoryTableProps {
  paginatedPhones: any[];
  filteredPhones: any[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setSelectedCompanyId: (id: string) => void;
  setViewMode: (mode: 'companies' | 'contacts' | 'phones') => void;
  handleInitiate: (payload: any) => void;
  paginationFooter?: React.ReactNode;
}

/**
 * Standardized 2-line B2B SaaS Phone & Tel Directory Sub-Tab Table with sticky opaque header and table-fixed layout.
 */
export const PhonesDirectoryTable: React.FC<PhonesDirectoryTableProps> = ({
  paginatedPhones,
  filteredPhones,
  searchQuery,
  setSearchQuery,
  setSelectedCompanyId,
  setViewMode,
  handleInitiate,
  paginationFooter
}) => {
  return (
    <div className="w-full overflow-x-clip relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs">
      <table className="w-full table-fixed text-left border-collapse text-xs font-sans">
        <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
          <tr>
            <th className="py-3 px-3.5 w-[18%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Phone Number</th>
            <th className="py-3 px-3.5 w-[12%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Type</th>
            <th className="py-3 px-3.5 w-[26%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Associated Entity</th>
            <th className="py-3 px-3.5 w-[20%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Role / Context</th>
            <th className="py-3 px-3.5 w-[14%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Location</th>
            <th className="py-3 px-3.5 w-[90px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Quick Dial</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {paginatedPhones.map((p) => {
            const isRestricted = Boolean(p.restriction);
            const badgeText = p.restriction === 'DNC' ? 'DNC' : 'INVALID';

            return (
              <tr
                key={p.id}
                onClick={() => {
                  if (p.companyId) {
                    setSelectedCompanyId(p.companyId);
                    setViewMode('companies');
                  }
                }}
                className="border-l-2 border-l-transparent hover:border-l-blue-500 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
              >
                <td className="py-2.5 px-3.5 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 align-middle overflow-hidden">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isRestricted ? (
                      <span className="line-through text-slate-400 cursor-not-allowed truncate" title={`Restricted line (${badgeText})`}>
                        {p.number}
                      </span>
                    ) : (
                      <span className="truncate" title={p.number}>{p.number}</span>
                    )}
                    {isRestricted && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border shrink-0 leading-none ${
                        p.restriction === 'Invalid'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {badgeText}
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium border inline-block truncate max-w-full ${
                      p.type === 'Mobile'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : p.type === 'Landline'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {p.type}
                  </span>
                </td>
                <td className="py-2.5 px-3.5 font-semibold text-slate-900 dark:text-slate-100 truncate align-middle" title={p.entityName}>
                  {p.entityName}
                </td>
                <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-300 truncate align-middle" title={p.subText || ''}>
                  {p.subText || <span className="text-slate-400 select-none">—</span>}
                </td>
                <td className="py-2.5 px-3.5 text-slate-500 dark:text-slate-400 truncate align-middle" title={p.location || ''}>
                  {p.location || <span className="text-slate-400 select-none">—</span>}
                </td>
                <td className="py-2.5 px-3.5 w-[90px] text-right whitespace-nowrap align-middle" onClick={(e) => e.stopPropagation()}>
                  {!isRestricted ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInitiate({
                          companyId: p.companyId,
                          companyName: p.subText,
                          contactId: p.contactId,
                          contactName: p.contactId ? p.entityName : undefined,
                          targetType: p.contactId ? 'contact' : 'company_mainline',
                          contactPhone: p.number,
                          channel: 'Call',
                          externalUrl: `tel:${p.number}`,
                          e
                        });
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs transition shadow-2xs cursor-pointer"
                    >
                      <PhoneCall className="w-3 h-3" />
                      <span>Call</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400 font-sans italic">Disabled</span>
                  )}
                </td>
              </tr>
            );
          })}

          {filteredPhones.length === 0 && (
            <tr>
              <td colSpan={6} className="py-12 px-4 text-center">
                {searchQuery.trim() ? (
                  <div className="max-w-md mx-auto space-y-2.5">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                      <Search className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      No phone numbers match &ldquo;{searchQuery.trim()}&rdquo;
                    </p>
                    <p className="text-xs text-slate-500">
                      Try searching by another digits sequence, person name, or company.
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/80 transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Clear Search / Reset Filters</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="max-w-md mx-auto space-y-2.5">
                    <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 border border-purple-200/60 flex items-center justify-center mx-auto">
                      <Phone className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      No phone numbers indexed yet
                    </p>
                    <p className="text-xs text-slate-500">
                      Add phone numbers to your companies or contacts to populate the quick-dial directory.
                    </p>
                  </div>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {paginationFooter}
    </div>
  );
};

export default CompanyModal;
export * from './CompanyModal';
export * from './CompanyCardView';
