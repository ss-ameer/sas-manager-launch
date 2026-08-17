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
    return [
      'Meeting Booked',
      'Quote Requested',
      'Information Gathered',
      'Follow-up Scheduled',
      'Deal Closed'
    ];
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

  return [
    'Meeting Booked',
    'Quote Requested',
    'Information Gathered',
    'Follow-up Scheduled',
    'Deal Closed'
  ];
}
