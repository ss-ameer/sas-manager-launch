import React from 'react';
import CompanyModal from './CompanyModal';
import { formatSubTypeName } from '../utils/taxonomy';
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
  getContactPhones,
  getContactEmails,
  getCompanyPhones,
  getCompanyEmails
} from '../types';
import { getReferenceId } from '../utils/refId';

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
  const aliases = Array.isArray(c.aliases) ? c.aliases : [];

  // 1. Direct Name / Alias / RefID Match (No hint needed - direct match)
  const matchedNameOrAlias =
    refId.includes(q) ||
    idStr.includes(q) ||
    canonicalName.includes(q) ||
    displayName.includes(q) ||
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
 * Muted pill rendered when a company lacks an assigned industry or business sector.
 */
export const UnassignedIndustryPill: React.FC<{ className?: string }> = ({
  className = ''
}) => (
  <span
    className={`text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full inline-flex items-center ${className}`}
  >
    Unassigned
  </span>
);

export default CompanyModal;
export * from './CompanyModal';
export * from './CompanyCardView';

