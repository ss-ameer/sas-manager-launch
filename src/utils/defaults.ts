import { Company, Contact, Enquiry, CallLogEntry, getInitials } from '../types';

export const SYSTEM_CALL_STATUSES = [
  'Completed',
  'Scheduled / Planned',
  'No Answer',
  'Busy',
  'Invalid Number'
];

export const SYSTEM_CALL_OUTCOMES = [
  'Connected',
  'Interested',
  'Interested - Quote Requested',
  'Left Voicemail',
  'Follow-Up Scheduled',
  'Proposal / Quote Requested',
  'Deal Closed / Won',
  'General Support / Inquiry',
  'Call Back Later',
  'Call Dropped / Disconnected',
  'Not Interested',
  'Wrong Number / Invalid',
  'Do Not Call (DNC)'
];

export const SYSTEM_CALL_PURPOSES = [
  'Validation',
  'Prospecting / Cold Outreach',
  'Prospecting / Intro',
  'Quote Follow-Up',
  'Order Confirmation',
  'Technical Review',
  'Commercial Negotiation',
  'Payment / Invoicing',
  'Customer Care',
  'Account Management',
  'Re-engagement',
  'Meeting / Demo',
  'Complaint / Issue Resolution',
  'Relationship Maintenance / Courtesy Call',
  'General Inquiry',
  'Other'
];

export const SYSTEM_CALL_STATUS_DESCRIPTIONS: Record<string, string> = {
  'Scheduled': 'Call is planned for a future time',
  'No Answer': 'Rang but no one picked up',
  'Busy': 'Line was engaged / call waiting',
  'Invalid Number': 'Number does not work, is disconnected, or is wrong',
  'Voicemail / Left Message': 'Reached voicemail and a message was left (or attempted)',
  'Invalid Number / Disconnected': 'Number does not work, is disconnected, or is wrong',
  'Connected': 'Someone answered the phone'
};

export const SYSTEM_CALL_OUTCOME_DESCRIPTIONS: Record<string, string> = {
  'Connected': 'Call connected successfully with recipient',
  'Reached – Decision Maker': 'Spoke with the correct / concerned person',
  'Reached – Wrong Person': 'Spoke with someone, but not the decision maker or concerned party',
  'Interested – Follow-up Requested': 'Positive interest; they want a later call or meeting',
  'Forwarded': 'Call, email, or message forwarded to another department or team member',
  'Call Dropped / Disconnected': 'Call dropped mid-conversation or network line disconnected',
  'Dead / Invalid Number': 'Phone number is dead, out of service, or invalid',
  'Cannot Be Reached / Unreachable': 'Target contact or phone line cannot be reached',
  'Not Interested': 'Explicitly declined or showed no interest',
  'Already Has Provider / Solution': 'They already use a competitor or have an existing solution',
  'Language Barrier': 'Could not communicate effectively due to language',
  'Do Not Call (DNC)': 'Explicit request to stop calling',
  'Closed – Deal Made': 'Agreement reached / sale closed on the call'
};

export function normalizeOptionName(str: string): string {
  if (!str) return '';
  return str
    .replace(/[\u2010-\u2015-]/g, '-') // Normalize all hyphens/dashes to standard hyphen
    .replace(/\s+/g, ' ')             // Normalize whitespace
    .trim()
    .toLowerCase();
}

export interface DropdownOption {
  id: string;
  name: string;
  color?: string;
}

export const SYSTEM_COMPANY_RELATIONSHIPS = [
  'Prospect',
  'Active Customer',
  'Former Customer',
  'Partner / Reseller',
  'Vendor / Supplier',
  'Competitor'
];

export const SYSTEM_COMPANY_TEMPERATURES = [
  'Hot',
  'Warm',
  'Cold',
  'DNC'
];

export const SYSTEM_RELATIONSHIP_COLORS: Record<string, string> = {
  'Prospect': '#3b82f6',        // Blue
  'Active Customer': '#10b981', // Emerald
  'Former Customer': '#64748b',  // Slate
  'Partner / Reseller': '#8b5cf6', // Indigo / Purple
  'Vendor / Supplier': '#f59e0b', // Amber
  'Competitor': '#f43f5e'       // Rose
};

export const SYSTEM_TEMPERATURE_COLORS: Record<string, string> = {
  'Hot': '#ef4444',  // Red
  'Warm': '#f59e0b', // Amber
  'Cold': '#06b6d4', // Cyan / Blue
  'DNC': '#e11d48'   // Rose / Dark Red
};

export function healDropdownOptions(
  currentList: DropdownOption[],
  defaults: string[],
  prefix: string,
  defaultColors?: Record<string, string>
): { mergedList: DropdownOption[]; changed: boolean } {
  const list = currentList ? [...currentList] : [];
  let changed = false;

  defaults.forEach((defName, i) => {
    const docId = prefix + '_' + i;
    const normDef = normalizeOptionName(defName);
    const defColor = defaultColors ? defaultColors[defName] : undefined;
    
    // Check if there is an item with the exact ID
    const existingByIdIndex = list.findIndex(item => item.id === docId);
    if (existingByIdIndex !== -1) {
      const existingById = list[existingByIdIndex];
      let itemChanged = false;
      let updatedItem = { ...existingById };

      if (normalizeOptionName(existingById.name) !== normDef) {
        updatedItem.name = defName;
        itemChanged = true;
      }
      if (defColor && !existingById.color) {
        updatedItem.color = defColor;
        itemChanged = true;
      }

      if (itemChanged) {
        list[existingByIdIndex] = updatedItem;
        changed = true;
      }
    } else {
      // Check if there is an item with the same name anywhere in the list under a different ID
      const existingByNameIndex = list.findIndex(item => normalizeOptionName(item.name) === normDef);
      if (existingByNameIndex !== -1) {
        const existingByName = list[existingByNameIndex];
        list[existingByNameIndex] = {
          ...existingByName,
          id: docId,
          color: existingByName.color || defColor
        };
        changed = true;
      } else {
        // Completely missing, append it!
        list.push({ id: docId, name: defName, color: defColor });
        changed = true;
      }
    }
  });

  // Strict Deduplication Pass: Ensure no two items have identical normalized names or IDs
  const seenNames = new Set<string>();
  const seenIds = new Set<string>();
  const deduplicatedList: DropdownOption[] = [];

  for (const item of list) {
    const normName = normalizeOptionName(item.name);
    if (!normName || seenNames.has(normName) || (item.id && seenIds.has(item.id))) {
      changed = true;
      continue;
    }
    seenNames.add(normName);
    if (item.id) seenIds.add(item.id);
    deduplicatedList.push(item);
  }

  return { mergedList: deduplicatedList, changed };
}

export function computeCanonicalName(displayName: string): string {
  if (!displayName) return '';
  let cleaned = displayName.toLowerCase();
  cleaned = cleaned.replace(/\b(l\.?l\.?c\.?|fze|fzc|fz-llc|inc\.?|corp\.?|corporation|ltd\.?|limited|pjsc|p\.?j\.?s\.?c\.?|w\.?l\.?l\.?|est\.?|co\.?|company)\b/gi, '');
  cleaned = cleaned.replace(/[^\w\s]/gi, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function generateCompanySearchTerms(displayName: string, city: string, phones: any[]): string[] {
  const terms = new Set<string>();

  if (displayName) {
    const lowerDisplay = displayName.toLowerCase().trim();
    if (lowerDisplay) terms.add(lowerDisplay);
    const words = lowerDisplay.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    words.forEach(w => terms.add(w));
  }

  const canon = computeCanonicalName(displayName);
  if (canon) {
    terms.add(canon);
    canon.split(/\s+/).filter(Boolean).forEach(w => terms.add(w));
  }

  if (city) {
    const lowerCity = city.toLowerCase().trim();
    if (lowerCity) {
      terms.add(lowerCity);
      lowerCity.split(/\s+/).filter(Boolean).forEach(w => terms.add(w));
    }
  }

  if (Array.isArray(phones)) {
    phones.forEach(p => {
      const numStr = typeof p === 'string' ? p : p?.number;
      if (numStr) {
        const cleanNum = numStr.replace(/[^\d+]/g, '').toLowerCase();
        if (cleanNum) terms.add(cleanNum);
        const digitsOnly = numStr.replace(/\D/g, '');
        if (digitsOnly) terms.add(digitsOnly);
      }
    });
  }

  return Array.from(terms);
}

export function generateContactSearchTerms(fullName: string, email?: string, phones?: any[]): string[] {
  const terms = new Set<string>();

  if (fullName) {
    const lowerName = fullName.toLowerCase().trim();
    if (lowerName) terms.add(lowerName);
    const words = lowerName.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    words.forEach(w => terms.add(w));
  }

  if (email) {
    const lowerEmail = email.toLowerCase().trim();
    if (lowerEmail) {
      terms.add(lowerEmail);
      const emailParts = lowerEmail.split(/[@._-]+/).filter(Boolean);
      emailParts.forEach(p => terms.add(p));
    }
  }

  if (Array.isArray(phones)) {
    phones.forEach(p => {
      const numStr = typeof p === 'string' ? p : p?.number;
      if (numStr) {
        const cleanNum = numStr.replace(/[^\d+]/g, '').toLowerCase();
        if (cleanNum) terms.add(cleanNum);
        const digitsOnly = numStr.replace(/\D/g, '');
        if (digitsOnly) terms.add(digitsOnly);
      }
    });
  }

  return Array.from(terms);
}

export function generateProductSearchTerms(name?: string, category?: string, sku?: string, brand?: string): string[] {
  const terms = new Set<string>();

  if (name) {
    const lowerName = name.toLowerCase().trim();
    if (lowerName) terms.add(lowerName);
    const words = lowerName.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    words.forEach(w => terms.add(w));
  }

  if (category) {
    const lowerCat = category.toLowerCase().trim();
    if (lowerCat) {
      terms.add(lowerCat);
      lowerCat.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).forEach(w => terms.add(w));
    }
  }

  if (sku) {
    const lowerSku = sku.toLowerCase().trim();
    if (lowerSku) {
      terms.add(lowerSku);
      lowerSku.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).forEach(w => terms.add(w));
    }
  }

  if (brand) {
    const lowerBrand = brand.toLowerCase().trim();
    if (lowerBrand) {
      terms.add(lowerBrand);
      lowerBrand.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).forEach(w => terms.add(w));
    }
  }

  return Array.from(terms);
}

export function normalizeCompany(raw: any, activeWsId?: string): Company {
  const now = new Date().toISOString();
  const wsId = raw?.workspace_id || raw?.workspaceId || activeWsId || 'ws_default';
  const displayName = raw?.display_name || raw?.canonical_name || 'Unnamed Company';
  const canonicalName = computeCanonicalName(displayName) || raw?.canonical_name || displayName.toLowerCase();
  const phones = raw?.phones || (raw?.general_phone ? [{ number: raw.general_phone }] : []);
  const searchTerms = Array.isArray(raw?.search_terms) && raw.search_terms.length > 0
    ? raw.search_terms
    : generateCompanySearchTerms(displayName, raw?.city || 'Dubai', phones);

  return {
    ...raw,
    workspace_id: wsId,
    createdAt: raw?.createdAt || now,
    updatedAt: raw?.updatedAt || raw?.createdAt || now,
    is_deleted: Boolean(raw?.is_deleted),
    canonical_name: canonicalName,
    legal_suffix: raw?.legal_suffix || 'None / To Be Added Later',
    display_name: displayName,
    aliases: Array.isArray(raw?.aliases) ? raw.aliases : [],
    country: raw?.country || 'UAE',
    city: raw?.city || 'Dubai',
    search_terms: searchTerms,
  };
}

export function normalizeContact(raw: any, activeWsId?: string): Contact {
  const now = new Date().toISOString();
  const wsId = raw?.workspace_id || raw?.workspaceId || activeWsId || 'ws_default';
  const fullName = raw?.full_name || 'Unnamed Contact';
  const phones = raw?.phones || [
    raw?.mobile ? { label: 'Mobile', number: raw.mobile } : null,
    raw?.landline ? { label: 'Telephone', number: raw.landline } : null,
  ].filter(Boolean);
  const email = raw?.email || raw?.primary_email || '';
  const searchTerms = Array.isArray(raw?.search_terms) && raw.search_terms.length > 0
    ? raw.search_terms
    : generateContactSearchTerms(fullName, email, phones);

  return {
    ...raw,
    workspace_id: wsId,
    createdAt: raw?.createdAt || now,
    updatedAt: raw?.updatedAt || raw?.createdAt || now,
    is_deleted: Boolean(raw?.is_deleted),
    company_id: raw?.company_id || '',
    full_name: fullName,
    search_terms: searchTerms,
  };
}

export function normalizeEnquiry(raw: any, activeWsId?: string): Enquiry {
  const now = new Date().toISOString();
  const wsId = raw?.workspace_id || raw?.workspaceId || activeWsId || 'ws_default';

  // Dual-Key Salesperson: sales_person_id and sales_person initials fallback
  let sales_person_id = raw?.sales_person_id || raw?.salesperson_id || '';
  let sales_person = raw?.sales_person || raw?.salesperson || '';

  if (!sales_person && raw?.sales_person_name) {
    sales_person = getInitials(raw.sales_person_name);
  } else if (!sales_person && sales_person_id) {
    sales_person = getInitials(sales_person_id);
  }

  return {
    ...raw,
    workspace_id: wsId,
    createdAt: raw?.createdAt || now,
    updatedAt: raw?.updatedAt || raw?.createdAt || now,
    is_deleted: Boolean(raw?.is_deleted),
    sales_person_id,
    sales_person,
    sn: typeof raw?.sn === 'number' ? raw.sn : 0,
    enquiry_date: raw?.enquiry_date || now.split('T')[0],
    company_id: raw?.company_id || '',
    country: raw?.country || 'UAE',
    project_location: raw?.project_location || 'Dubai',
    enquiry_source: raw?.enquiry_source || 'Direct',
    status: raw?.status || 'Active',
    quote_ref_no: raw?.quote_ref_no || '',
    value_aed: typeof raw?.value_aed === 'number' ? raw.value_aed : 0,
    line_items: Array.isArray(raw?.line_items) ? raw.line_items : [],
    parent_id: raw?.parent_id ?? null,
    revision_number: typeof raw?.revision_number === 'number' ? raw.revision_number : (raw?.parent_id ? 1 : 0),
  };
}

export function normalizeCallLog(raw: any, activeWsId?: string, companies?: Company[]): CallLogEntry {
  const now = new Date().toISOString();
  const wsId = raw?.workspace_id || raw?.workspaceId || activeWsId || 'ws_default';

  let company_name = raw?.company_name;
  if (raw?.company_id && companies && companies.length > 0) {
    const matched = companies.find((c) => c.id === raw.company_id);
    if (matched) {
      company_name = matched.display_name || matched.canonical_name || company_name;
    }
  }

  // Dual-Key Salesperson: sales_person_id and sales_person initials fallback
  let sales_person_id = raw?.sales_person_id || raw?.handled_by_salesperson_id || raw?.salesperson_id || '';
  let sales_person = raw?.sales_person || raw?.salesperson || '';

  if (!sales_person && raw?.handled_by_team_member_name) {
    sales_person = getInitials(raw.handled_by_team_member_name);
  } else if (!sales_person && raw?.logged_by) {
    sales_person = getInitials(raw.logged_by);
  } else if (!sales_person && sales_person_id) {
    sales_person = getInitials(sales_person_id);
  }

  return {
    ...raw,
    company_name,
    workspace_id: wsId,
    createdAt: raw?.createdAt || now,
    updatedAt: raw?.updatedAt || raw?.createdAt || now,
    is_deleted: Boolean(raw?.is_deleted),
    sales_person_id,
    sales_person,
    date: raw?.date || now.split('T')[0],
    status: raw?.status || 'Scheduled',
    logged_by: raw?.logged_by || 'System',
  };
}


