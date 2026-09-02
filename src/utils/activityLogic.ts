import { ActivityChannel, CallStatus } from '../types';

export const CHANNELS = [
  'Phone Call',
  'Message (WhatsApp/SMS)',
  'Email',
  'Meeting (Virtual/In-Person)',
  'Site Visit',
  'Internal Task / Admin'
] as const;

export type MasterActivityChannel = (typeof CHANNELS)[number];

export const PURPOSES = [
  'Inbound Enquiry',
  'Introduction / Pitch',
  'Discovery / Qualification',
  'Follow-up / Check-in',
  'Closing / Negotiation',
  'Issue Resolution',
  'Re-engagement / Win-Back',
  'Internal Prep / Quote Building',
  'Order Fulfillment / Logistics'
] as const;

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
    return ['Sent / Completed', 'Scheduled / Draft', 'Failed / Bounced'];
  }

  // Meeting / Site Visit
  if (
    norm.includes('meeting') ||
    norm.includes('site visit') ||
    norm.includes('visit')
  ) {
    return ['Completed', 'Scheduled / Planned', 'Cancelled', 'Rescheduled'];
  }

  // Internal Task / Admin
  if (
    norm.includes('internal') ||
    norm.includes('task') ||
    norm.includes('admin')
  ) {
    return ['Completed', 'In Progress', 'Scheduled / Planned'];
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

