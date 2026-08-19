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

export const DEFAULT_CALL_OUTCOMES = [
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

export function getOutcomesForStatus(status: CallStatus | string): string[] {
  const completedStatuses = [
    'Completed Log',
    'Completed',
    'Conducted',
    'Message Sent',
    'Email Sent',
    'Read / Seen',
    'Opened / Replied'
  ];

  const pendingNoAnswerStatuses = [
    'No Answer',
    'Busy',
    'Scheduled / Planned',
    'Scheduled'
  ];

  const failedCancelledStatuses = [
    'Invalid Number',
    'Bounced / Failed',
    'Blocked',
    'No Show',
    'Rescheduled',
    'Cancelled'
  ];

  if (completedStatuses.includes(status)) {
    return DEFAULT_CALL_OUTCOMES;
  }

  if (pendingNoAnswerStatuses.includes(status)) {
    return [
      'Left Voicemail',
      'Gatekeeper Blocked',
      'Call Dropped',
      'Awaiting Reply',
      'No Action Required'
    ];
  }

  if (failedCancelledStatuses.includes(status)) {
    return [
      'Contact No Longer with Company',
      'Fake/Spam Details',
      'Number Disconnected',
      'Action Cancelled'
    ];
  }

  return DEFAULT_CALL_OUTCOMES;
}
