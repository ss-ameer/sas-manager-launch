import { ActivityChannel, CallStatus, Company, Contact, Workspace, getContactPhones, isSamePhoneNumber } from '../types';
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


