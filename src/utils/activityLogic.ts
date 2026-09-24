import { ActivityChannel, CallLogEntry, CallStatus, Company, Contact, Workspace, getContactPhones, isSamePhoneNumber } from '../types';
import { SYSTEM_CALL_PURPOSES } from './defaults';

export const CHANNELS = [
  'Phone Call',
  'Message (WhatsApp/SMS)',
  'Email',
  'Meeting (Virtual/In-Person)',
  'Site Visit',
  'Internal Task / Admin'
] as const;

export type MasterActivityChannel = (typeof CHANNELS)[number];

export const PURPOSES = SYSTEM_CALL_PURPOSES;

export type MasterPurpose = (typeof PURPOSES)[number];

export const POSITIVE_OUTCOMES = [
  'Meeting Booked',
  'Quote / Proposal Requested',
  'Interested / Send Info',
  'Deal Closed / Won'
] as const;

export const NEUTRAL_OUTCOMES = [
  'Active Negotiation',
  'Quote / Info Sent',
  'Message Sent / Awaiting Reply',
  'Collateral / Material Left',
  'Follow-up Scheduled',
  'Requested Call Back',
  'Information Gathered',
  'No Current Requirement',
  'No Current Need'
] as const;

export const NEGATIVE_OUTCOMES = [
  'No Response / Ghosted',
  'Under Contract / Bad Timing',
  'Price / Budget Objection',
  'Gatekeeper Blocked',
  'Not Interested',
  'Using Competitor',
  'Wrong Person / Unqualified'
] as const;

export const OUTCOMES = [
  ...POSITIVE_OUTCOMES,
  ...NEUTRAL_OUTCOMES,
  ...NEGATIVE_OUTCOMES
] as const;

export type MasterOutcome = (typeof OUTCOMES)[number];

export const SUCCESS_STATUSES = [
  'Completed / Connected',
  'Sent / Delivered',
  'Completed / Attended',
  'Completed'
] as const;

/**
 * Returns valid statuses for a given interaction channel matching the V3 matrix.
 */
export function getStatusesForChannel(channel?: string): string[] {
  const norm = (channel || 'Phone Call').toLowerCase().trim();

  // Email / Message / WhatsApp / SMS
  if (
    norm.includes('email') ||
    norm.includes('message') ||
    norm.includes('whatsapp') ||
    norm.includes('sms')
  ) {
    return ['Sent', 'Scheduled / Planned', 'Failed / Bounced'];
  }

  // Meeting / Site Visit
  if (
    norm.includes('meeting') ||
    norm.includes('site visit') ||
    norm.includes('visit')
  ) {
    return ['Completed', 'Scheduled / Planned', 'Cancelled'];
  }

  // Internal Task / Admin
  if (
    norm.includes('internal') ||
    norm.includes('task') ||
    norm.includes('admin')
  ) {
    return ['Completed', 'Scheduled / Planned', 'In Progress'];
  }

  // Default: Phone Call
  return [
    'Completed',
    'Scheduled / Planned',
    'No Answer',
    'Busy',
    'Invalid Number'
  ];
}

/**
 * Normalizes raw status strings for clean, channel-appropriate single-word badge display:
 * - Phone Call: 'Connected', 'Scheduled', 'No Answer', 'Busy', 'Call Dropped', 'Invalid Number'
 * - Message / Email: 'Sent', 'Scheduled', 'Failed'
 * - Site Visit / Meeting: 'Completed', 'Scheduled', 'Cancelled'
 * - Internal Task: 'Completed', 'Scheduled', 'In Progress'
 */
export function normalizeStatusBadgeLabel(status?: string, channel?: string): string {
  if (!status) return 'Logged';
  const trimmed = status.trim();
  const lower = trimmed.toLowerCase();
  const chanLower = (channel || '').toLowerCase().trim();
  const isMsgOrEmail = chanLower.includes('whatsapp') || chanLower.includes('message') || chanLower.includes('email') || chanLower.includes('sms') || chanLower.includes('mail');
  const isMeetingOrSite = chanLower.includes('meeting') || chanLower.includes('site') || chanLower.includes('visit');

  if (isMsgOrEmail) {
    if (lower === 'completed' || lower.includes('sent') || lower.includes('delivered')) {
      return 'Sent';
    }
    if (lower.includes('scheduled') || lower.includes('planned') || lower.includes('draft')) {
      return 'Scheduled';
    }
    if (lower.includes('failed') || lower.includes('bounced') || lower.includes('invalid')) {
      return 'Failed';
    }
  }

  if (isMeetingOrSite) {
    if (lower === 'completed' || lower.includes('conducted')) {
      return 'Completed';
    }
    if (lower.includes('scheduled') || lower.includes('planned')) {
      return 'Scheduled';
    }
    if (lower.includes('cancelled') || lower.includes('canceled') || lower.includes('no show') || lower.includes('denied') || lower.includes('rescheduled')) {
      return 'Cancelled';
    }
  }

  if (chanLower.includes('task') || chanLower.includes('internal') || chanLower.includes('admin')) {
    if (lower === 'completed') return 'Completed';
    if (lower.includes('scheduled') || lower.includes('planned')) return 'Scheduled';
    if (lower.includes('progress') || lower.includes('working') || lower.includes('blocked')) return 'In Progress';
  }

  // Phone Call (or general fallback)
  if (lower === 'completed / connected' || lower === 'connected' || ((!chanLower || chanLower.includes('call') || chanLower.includes('phone')) && (lower === 'completed' || lower === 'completed log'))) {
    return 'Connected';
  }
  if (lower === 'no answer / voicemail' || lower === 'no answer / busy' || lower === 'no answer' || lower === 'busy' || lower === 'busy / no answer') {
    return 'No Answer';
  }
  if (lower === 'invalid / wrong number' || lower === 'invalid/wrong number' || lower === 'invalid number' || lower === 'wrong number') {
    return 'Invalid Number';
  }
  if (lower === 'call dropped / disconnected' || lower === 'call dropped/disconnected' || lower === 'call dropped' || lower === 'follow-up required' || lower.includes('dropped')) {
    return 'Call Dropped';
  }
  if (lower === 'scheduled / planned' || lower === 'scheduled / draft' || lower === 'scheduled') {
    return 'Scheduled';
  }
  if (lower.includes('cancel')) {
    return 'Cancelled';
  }

  if (trimmed.includes(' / ')) {
    const parts = trimmed.split(' / ');
    const firstTerm = parts[0]?.trim().toLowerCase();
    if (firstTerm === 'completed' || firstTerm === 'scheduled') {
      return parts.slice(1).join(' / ').trim() || trimmed;
    }
  }

  return trimmed;
}

/**
 * Determines whether a given status represents a successful interaction
 * where an outcome can be meaningfully recorded.
 */
export function isSuccessStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return (
    s === 'completed / connected' ||
    s === 'sent / delivered' ||
    s === 'completed / attended' ||
    s === 'completed' ||
    s === 'completed log' ||
    s === 'conducted' ||
    s === 'message sent' ||
    s === 'email sent' ||
    s.startsWith('completed') ||
    s.startsWith('sent') ||
    s.includes('conducted') ||
    s.includes('connected') ||
    s.includes('attended')
  );
}

/**
 * Returns valid outcomes for a given status or channel/status pair.
 */
export function getOutcomesForStatus(
  statusOrChannel?: ActivityChannel | CallStatus | string,
  maybeStatus?: CallStatus | string
): string[] {
  const targetStatus = maybeStatus || statusOrChannel;
  if (targetStatus && !isSuccessStatus(targetStatus)) {
    return [];
  }
  return [...OUTCOMES];
}

// Backward compatibility helpers & arrays
export function getPurposesForChannel(_channel?: ActivityChannel | string): string[] {
  return [...PURPOSES];
}

export const CALL_OUTCOMES = [...OUTCOMES];
export const MEETING_OUTCOMES = [...OUTCOMES];
export const SITE_VISIT_OUTCOMES = [...OUTCOMES];
export const MESSAGE_OUTCOMES = [...OUTCOMES];

export interface AutoResolvedContact {
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  contact_designation?: string;
  contact_email?: string;
}

/**
 * Checks whether a contact identification (id or name) is missing or unassigned.
 */
export function isContactUnassigned(id?: string, name?: string): boolean {
  if (!id && !name) return true;
  if (!name || !name.trim()) return !id;
  const lower = name.trim().toLowerCase();
  return (
    lower === 'no personnel contact assigned' ||
    lower === 'no contact person' ||
    lower === 'no contact' ||
    lower === 'company mainline' ||
    lower === 'mainline' ||
    lower === 'unassigned' ||
    lower === 'general line'
  );
}

/**
 * Auto-resolves contact person details from a dialed/selected phone number by searching
 * against company contacts (or all contacts).
 * Uses clean phone number matching (stripping formatting, country code variations, etc.).
 */
export function resolveContactByPhoneNumber(
  phone?: string,
  contacts?: Contact[],
  targetCompanyId?: string
): AutoResolvedContact | null {
  if (!phone || !phone.trim() || !contacts || contacts.length === 0) return null;
  const cleanPhone = phone.trim();

  // First prioritize contacts linked to the target company
  const companyContacts = targetCompanyId
    ? contacts.filter((c) => c.company_id === targetCompanyId || (c as any).company_ids?.includes(targetCompanyId))
    : [];

  const candidatePool = companyContacts.length > 0 ? companyContacts : contacts;

  for (const ct of candidatePool) {
    const phones = getContactPhones(ct);
    const hasPhoneMatch = phones.some((p) => isSamePhoneNumber(p.number || p.value, cleanPhone));
    const hasDirectMatch =
      isSamePhoneNumber(ct.mobile, cleanPhone) ||
      isSamePhoneNumber(ct.landline, cleanPhone) ||
      isSamePhoneNumber(ct.phone, cleanPhone);

    if (hasPhoneMatch || hasDirectMatch) {
      return {
        contact_id: ct.id || '',
        contact_name: ct.full_name || (ct as any).name || '',
        contact_phone: cleanPhone,
        contact_designation: ct.designation || (ct as any).role || undefined,
        contact_email: ct.email || undefined
      };
    }
  }

  // Fallback check against remaining contacts if not found in target company
  if (companyContacts.length > 0 && companyContacts.length < contacts.length) {
    for (const ct of contacts) {
      if (companyContacts.includes(ct)) continue;
      const phones = getContactPhones(ct);
      const hasPhoneMatch = phones.some((p) => isSamePhoneNumber(p.number || p.value, cleanPhone));
      const hasDirectMatch =
        isSamePhoneNumber(ct.mobile, cleanPhone) ||
        isSamePhoneNumber(ct.landline, cleanPhone) ||
        isSamePhoneNumber(ct.phone, cleanPhone);

      if (hasPhoneMatch || hasDirectMatch) {
        return {
          contact_id: ct.id || '',
          contact_name: ct.full_name || (ct as any).name || '',
          contact_phone: cleanPhone,
          contact_designation: ct.designation || (ct as any).role || undefined,
          contact_email: ct.email || undefined
        };
      }
    }
  }

  return null;
}

/**
 * Resolves Geography / Region snapshot.
 * Inherits company.jurisdiction or company.city (e.g. 'Abu Dhabi, UAE') instead of falling back
 * to the user's workspace default (e.g., 'Dubai, UAE').
 * Only falls back to workspace default territory if the company record itself lacks any city/jurisdiction data.
 */
export function resolveGeographyFromCompany(
  company?: Company | null,
  workspace?: Workspace | null,
  existingGeography?: string
): string {
  if (company) {
    const jurisdiction = (company as any).jurisdiction?.trim();
    if (jurisdiction) return jurisdiction;

    const city = company.city?.trim();
    const country = company.country?.trim();

    if (city && country) {
      if (city.toLowerCase().includes(country.toLowerCase())) {
        return city;
      }
      return `${city}, ${country}`;
    }
    if (city) return city;
    if (country) return country;
  }

  // If an existing valid geography is present on the log and company had no city/jurisdiction
  if (existingGeography && existingGeography.trim()) {
    return existingGeography.trim();
  }

  if (workspace?.geography_options && workspace.geography_options.length > 0) {
    return workspace.geography_options[0];
  }

  return 'Dubai, UAE';
}

/**
 * Extract actual event occurrence timestamp from an activity record.
 * Prioritizes date, timestamp, occurred_at over created_at / createdAt.
 */
export function getEventOccurrenceTimestamp(item: any): string {
  if (!item) return '';
  return (
    item.date ||
    item.timestamp ||
    item.occurred_at ||
    item.occurredAt ||
    item.executed_at ||
    item.executedAt ||
    item.completed_at ||
    item.completedAt ||
    item.createdAt ||
    item.created_at ||
    ''
  );
}

/**
 * Strips repeated or nested [Notes]: prefixes and trims surrounding whitespace.
 */
export function cleanNotePrefix(text?: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  // Strip repeated / nested [Notes]: or [Notes] prefixes
  while (/^\[Notes\]:?\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^\[Notes\]:?\s*/i, '').trim();
  }
  return cleaned;
}

/**
 * Combines existing task requirement notes with new interaction notes,
 * strictly preventing recursive nesting, duplicate headers, or duplicate retry templates.
 */
export function combineInteractionNotes(existingNotes?: string, newNotes?: string): string {
  const cleanExisting = (existingNotes || '').trim();
  const rawNew = (newNotes || '').trim();
  if (!rawNew) return cleanExisting;

  const cleanedNew = cleanNotePrefix(rawNew);
  if (!cleanedNew) return cleanExisting;

  // If the new notes start with or equal retry callback template, ensure clean formatting without [Notes]: wrapping
  const isRetryTemplate =
    cleanedNew.toLowerCase().startsWith('call dropped / disconnected') ||
    cleanedNew.toLowerCase().startsWith('retry callback');

  if (!cleanExisting) {
    return isRetryTemplate ? cleanedNew : `[Notes]: ${cleanedNew}`;
  }

  // Avoid appending if the exact same note is already contained in existing notes
  if (cleanExisting.includes(cleanedNew)) {
    return cleanExisting;
  }

  if (isRetryTemplate) {
    return `${cleanExisting}\n${cleanedNew}`;
  }

  return `${cleanExisting}\n[Notes]: ${cleanedNew}`;
}

/**
 * Evaluates whether an activity log is an active pending / scheduled task.
 * If status is 'scheduled' or 'scheduled / planned', it is strictly treated as a scheduled task
 * unless its status has explicitly changed to completed, cancelled, or failed.
 * A rogue completedAt / completed_at field will NOT disqualify it from queuedTasks.
 */
export function isScheduledTask(log: CallLogEntry | Partial<CallLogEntry> | null | undefined): boolean {
  if (!log || log.is_deleted) return false;
  const status = (log.status || '').toLowerCase().trim();
  const outcome = (log.outcome || '').toLowerCase().trim();

  // Explicit terminal statuses: completed, cancelled, failed, superseded
  if (
    status === 'cancelled' ||
    status === 'canceled' ||
    status.includes('cancelled') ||
    status.includes('canceled') ||
    Boolean((log as any).cancellation_reason) ||
    status === 'superseded' ||
    status === 'completed' ||
    status.startsWith('completed') ||
    status === 'conducted' ||
    status.includes('conducted') ||
    status === 'failed' ||
    status.includes('failed') ||
    status === 'invalid' ||
    status === 'invalid number' ||
    status === 'bounced'
  ) {
    return false;
  }

  // Any activity with scheduled or planned status
  const isScheduledStatus =
    status === 'scheduled' ||
    status === 'scheduled / planned' ||
    status === 'scheduled / draft' ||
    status === 'planned' ||
    status === 'draft' ||
    status === 'rescheduled' ||
    status === 'pending' ||
    status.startsWith('scheduled') ||
    status.includes('scheduled');

  if (isScheduledStatus) {
    return true;
  }

  const hasScheduledDate = Boolean(log.next_followup_date || (log as any).scheduled_for);
  const isTaskFlag = Boolean((log as any).is_task);

  // If flagged as task and outcome does not indicate completed
  if (isTaskFlag && !outcome.includes('completed') && !outcome.includes('cancelled')) {
    return true;
  }

  // If has scheduled date and outcome is not completed
  if (hasScheduledDate && !outcome.includes('completed') && !outcome.includes('cancelled') && (status === '' || status === 'scheduled')) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether a phone number is likely a toll-free (e.g. 800) or fixed landline number.
 */
export function isTollFreeOrLandline(phone?: string, label?: string): boolean {
  if (!phone) return false;
  const lbl = (label || '').toLowerCase().trim();
  if (
    lbl.includes('landline') ||
    lbl.includes('office') ||
    lbl.includes('switchboard') ||
    lbl.includes('toll') ||
    lbl.includes('fax') ||
    lbl.includes('desk') ||
    lbl.includes('mainline') ||
    lbl.includes('reception') ||
    lbl.includes('front desk')
  ) {
    return true;
  }
  const clean = phone.replace(/[^\d+]/g, '');
  // UAE Toll Free / International 800 numbers: 800..., +971800..., 00971800..., 971800..., +1800...
  if (
    clean.startsWith('800') ||
    clean.startsWith('+971800') ||
    clean.startsWith('00971800') ||
    clean.startsWith('971800') ||
    clean.startsWith('+1800') ||
    clean.startsWith('1800') ||
    clean.startsWith('+1888') ||
    clean.startsWith('+1877') ||
    clean.startsWith('+1866')
  ) {
    return true;
  }
  // UAE Fixed Landlines: 02, 03, 04, 06, 07, 09 or +9712, +9713, +9714, etc.
  const uaeClean = clean.startsWith('+971')
    ? clean.slice(4)
    : clean.startsWith('00971')
      ? clean.slice(5)
      : clean.startsWith('971')
        ? clean.slice(3)
        : clean;
  if (/^0[234679]\d{7}$/.test(uaeClean) || /^[234679]\d{7}$/.test(uaeClean)) {
    return true;
  }
  return false;
}

/**
 * Evaluates whether a phone number is likely a mobile phone number suitable for WhatsApp / SMS.
 */
export function isLikelyMobileNumber(phone?: string, label?: string): boolean {
  if (!phone) return false;
  if (isTollFreeOrLandline(phone, label)) return false;
  const lbl = (label || '').toLowerCase().trim();
  if (lbl.includes('mobile') || lbl.includes('cell') || lbl.includes('whatsapp') || lbl.includes('personal')) {
    return true;
  }
  const clean = phone.replace(/[^\d+]/g, '');
  const uaeClean = clean.startsWith('+971')
    ? clean.slice(4)
    : clean.startsWith('00971')
      ? clean.slice(5)
      : clean.startsWith('971')
        ? clean.slice(3)
        : clean;
  // UAE mobile starts with 05 or 5 followed by 8 digits
  if (/^0?5[024568]\d{7}$/.test(uaeClean)) {
    return true;
  }
  return !isTollFreeOrLandline(phone, label);
}

/**
 * Resolves the best mobile phone number for a contact, specifically prioritizing mobile lines
 * over landlines or toll-free switchboard numbers for WhatsApp or SMS outreach.
 */
export function getBestMobileForContact(contact?: Partial<Contact> | null): string | null {
  if (!contact) return null;
  // 1. Direct explicit mobile field
  if (contact.mobile && !isTollFreeOrLandline(contact.mobile, 'Mobile')) {
    return contact.mobile;
  }
  // 2. Check contact's phones array for mobile-labeled lines
  const phones = getContactPhones(contact);
  const mobileLabeled = phones.find((p) => {
    const lbl = (p.label || '').toLowerCase();
    return (
      (lbl.includes('mobile') || lbl.includes('cell') || lbl.includes('whatsapp')) &&
      !isTollFreeOrLandline(p.value, p.label)
    );
  });
  if (mobileLabeled) {
    return mobileLabeled.value;
  }
  // 3. Any phone in list that is likely mobile
  const anyMobile = phones.find((p) => isLikelyMobileNumber(p.value, p.label));
  if (anyMobile) {
    return anyMobile.value;
  }
  // 4. Contact phone if not landline/toll-free
  if (contact.phone && !isTollFreeOrLandline(contact.phone)) {
    return contact.phone;
  }
  return null;
}

/**
 * Searches across available company contacts to find the best contact and mobile phone number for WhatsApp outreach.
 */
export function resolveBestCompanyMobile(
  companyContacts: Contact[],
  currentContact?: Partial<Contact> | null
): { contact: Contact; phone: string } | null {
  // 1. Check current contact first
  if (currentContact) {
    const directMobile = getBestMobileForContact(currentContact);
    if (directMobile) {
      return { contact: currentContact as Contact, phone: directMobile };
    }
  }
  if (!companyContacts || companyContacts.length === 0) return null;
  // 2. Check primary contact
  const primary = companyContacts.find((c) => c.is_primary || (c as any).isPrimary);
  if (primary) {
    const pMobile = getBestMobileForContact(primary);
    if (pMobile) {
      return { contact: primary, phone: pMobile };
    }
  }
  // 3. Check any other company contact
  for (const c of companyContacts) {
    const cMobile = getBestMobileForContact(c);
    if (cMobile) {
      return { contact: c, phone: cMobile };
    }
  }
  return null;
}

export function isMessageChannel(ch?: string): boolean {
  const norm = String(ch || '').toLowerCase();
  return norm.includes('message') || norm.includes('whatsapp') || norm.includes('sms');
}

export function isPhoneChannel(ch?: string): boolean {
  const norm = String(ch || '').toLowerCase();
  return norm.includes('call') || norm.includes('phone');
}


