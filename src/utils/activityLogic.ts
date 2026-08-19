import { ActivityChannel, CallStatus } from '../types';

export function getPurposesForChannel(channel: ActivityChannel): string[] {
  if (channel === 'WhatsApp' || channel === 'Email') {
    return [
      'Cold Outreach (Intro)',
      'Document Transmission (Profile/Quote)',
      'Gentle Follow-up',
      'Meeting Confirmation'
    ];
  }
  return [
    'Discovery / Validation',
    'Introduction / Pitch',
    'Follow-up / Check-in',
    'Closing / Negotiation',
    'Issue Resolution'
  ];
}

export const CALL_OUTCOMES = [
  'Meeting Booked',
  'Quote Requested',
  'Follow-up Scheduled',
  'Requested Call Back',
  'Information Gathered',
  'Using Competitor / Has Provider',
  'Not Interested',
  'Wrong Person',
  'Needs Qualification / Unclear',
  'Deal Closed',
  'General Connection / Other'
];

export const MEETING_OUTCOMES = [
  'Deal Closed',
  'Proposal / Quote Submitted',
  'Follow-up Scheduled',
  'Rescheduled',
  'Decision Pending',
  'Not Interested',
  'Needs Qualification / Unclear',
  'General Connection / Other'
];

export const SITE_VISIT_OUTCOMES = [
  'Site Inspected / Verified',
  'Met Decision Maker',
  'Gatekeeper Only / No Access',
  'Rescheduled on Site',
  'Quote Requested',
  'Follow-up Scheduled',
  'Deal Closed',
  'General Connection / Other'
];

export const MESSAGE_OUTCOMES = [
  'Replied / Engaged',
  'Meeting Booked',
  'Quote Requested',
  'Follow-up Scheduled',
  'Not Interested',
  'Invalid / Bounced',
  'General Connection / Other'
];

export function getOutcomesForStatus(
  channel?: ActivityChannel | string,
  _status?: CallStatus | string
): string[] {
  const normalizedChannel = (channel || 'Call').toLowerCase();

  switch (normalizedChannel) {
    case 'meeting':
      return MEETING_OUTCOMES;
    case 'site visit':
    case 'site_visit':
      return SITE_VISIT_OUTCOMES;
    case 'email':
    case 'whatsapp':
    case 'message':
      return MESSAGE_OUTCOMES;
    case 'call':
    default:
      return CALL_OUTCOMES;
  }
}

